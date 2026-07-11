// threads_realm_stub.pre.js — P1a engine-thread realm stub (design:
// WebAssembly/notes/p1-engine-thread.md, settled decision #3).
//
// Injected with `--pre-js` into the THREADED cnc-port build ONLY
// (CNC_PORT_THREADS=ON in CMakeLists.txt). The default single-threaded build
// never sees this file.
//
// emsdk 3.1.6 placement facts (verified against the generated
// dist-threaded/cnc-port.js and cnc-port.worker.js):
//   - pre-js is emitted at `// {{PRE_JSES}}` in shell.js: INSIDE the
//     MODULARIZE factory, after `var Module = ...` and the ready-promise
//     integration code, but BEFORE `var ENVIRONMENT_IS_PTHREAD = ...` is
//     declared. So the realm guard must read Module["ENVIRONMENT_IS_PTHREAD"]
//     directly — cnc-port.worker.js sets it to true on the Module object it
//     passes to the factory (in its `e.data.cmd === 'load'` branch) before
//     the factory runs; in the main window realm it is undefined.
//   - The factory's ready promise resolves with this same Module object, so
//     the Module captured here is the object that later carries the wasm
//     exports (Module["_name"]) in this worker realm.
//   - cnc-port.worker.js installs `self.onmessage` by ASSIGNMENT, so an
//     addEventListener("message") here coexists with emscripten's own
//     protocol; both see every message, worker.js first.
//   - worker.js err()-logs "received unknown command undefined" for any
//     message whose shape it does not know — EXCEPT `{target:'setimmediate'}`
//     which is an explicit silent no-op branch (its setImmediate emulation).
//     Messages to this stub therefore ride `{target:'setimmediate',
//     __cncRealm:{...}}` on the default channel. Same story for
//     worker→main replies: PThread's worker.onmessage on the main thread
//     err()-logs unknown cmds, and its 'setimmediate' branch ECHOES the
//     message back to the worker — harmless (this stub ignores its own
//     reply shapes), but noisy in principle, so the real command traffic
//     moves onto a dedicated MessageChannel port as soon as the main realm
//     sends `connect` (transferring the port). After connect, __cncRealm
//     traffic never touches emscripten's channels at all.
//
// Protocol (all payloads live under data.__cncRealm; everything else is
// ignored so emscripten's own messages are never disturbed):
//   {cmd:"connect"} + transferred MessagePort
//       → adopt port for all further commands/replies; reply {cmd:"connected"}.
//   {cmd:"ping"}
//       → {cmd:"pong", isPthread:true}
//   {cmd:"setup", moduleUrl, canvas, options?}   (canvas = transferred
//         OffscreenCanvas; options = plain data passed through verbatim)
//       → dynamic import(moduleUrl), await its default({canvas, Module,
//         realm:"engine", options}); reply {cmd:"setupDone", ok, error?,
//         hooksInstalled?}. The stub stays generic: ALL executor logic lives
//         in the imported module (P1b's realm-agnostic GL executor; the P1a
//         probe uses harness/engine_realm_test_executor.mjs, P1c's real boot
//         module is harness/engine_realm_boot.mjs).
//         P1c extension: when the imported module's default() resolves to an
//         object with a `handleCommand(msg, respond)` function, every command
//         this stub does NOT recognize is forwarded to it (respond posts
//         {__cncRealm: payload} on the connected port). That keeps the baked
//         -in stub tiny and generic while the (rebuildable-without-relink)
//         boot module owns the whole P1c protocol.
//   {cmd:"callExport", name, args:[...numbers], id}
//       → Module["_"+name](...args); reply {cmd:"callExportResult", id,
//         value} (numeric returns only for now). This is the RPC-forwarding
//         primitive P1c builds on.
(function () {
  var isPthreadRealm = false;
  try {
    isPthreadRealm =
      typeof Module !== "undefined" &&
      Module !== null &&
      !!Module["ENVIRONMENT_IS_PTHREAD"] &&
      typeof importScripts === "function";
  } catch (e) {
    isPthreadRealm = false;
  }
  if (!isPthreadRealm) {
    return; // main realm (or unexpected realm): install nothing.
  }

  var realmModule = Module;
  var connectedPort = null;
  var moduleCommandHandler = null; // installed by the setup module (P1c)

  function respond(viaPort, payload, transfer) {
    var envelope = { __cncRealm: payload };
    try {
      if (viaPort) {
        viaPort.postMessage(envelope, transfer || []);
      } else {
        // Default-channel reply: tag with target:'setimmediate' so the main
        // thread's PThread worker.onmessage takes its silent branch instead
        // of err("worker sent an unknown command"). 3.1.6 echoes such
        // messages back to this worker; the dispatcher below ignores
        // reply-shaped cmds, so the bounce terminates silently.
        envelope.target = "setimmediate";
        self.postMessage(envelope, transfer || []);
      }
    } catch (e) {
      // Reply channel gone — nothing useful to do from a worker realm.
    }
  }

  function handleCommand(msg, replyPort) {
    var cmd = msg && msg.cmd;
    if (cmd === "ping") {
      respond(replyPort, { cmd: "pong", isPthread: true });
      return;
    }
    if (cmd === "setup") {
      // Chromium allows dynamic import() in classic dedicated workers (the
      // same mechanism cnc-port.worker.js uses to load the ES6 module).
      Promise.resolve()
        .then(function () {
          return import(msg.moduleUrl);
        })
        .then(function (executorModule) {
          return executorModule.default({
            canvas: msg.canvas,
            Module: realmModule,
            realm: "engine",
            options: msg.options != null ? msg.options : null,
          });
        })
        .then(
          function (result) {
            var reply = { cmd: "setupDone", ok: true };
            if (result && result.hooksInstalled) {
              reply.hooksInstalled = result.hooksInstalled;
            }
            if (result && typeof result.handleCommand === "function") {
              moduleCommandHandler = result.handleCommand;
              reply.moduleCommandHandler = true;
            }
            respond(replyPort, reply);
          },
          function (error) {
            respond(replyPort, {
              cmd: "setupDone",
              ok: false,
              error: String((error && error.stack) || error),
            });
          }
        );
      return;
    }
    if (cmd === "callExport") {
      var reply = { cmd: "callExportResult", id: msg.id };
      try {
        var fn = realmModule["_" + msg.name];
        if (typeof fn !== "function") {
          throw new Error("no wasm export _" + msg.name + " on this realm's Module");
        }
        reply.value = fn.apply(null, msg.args || []);
      } catch (error) {
        reply.error = String((error && error.stack) || error);
      }
      respond(replyPort, reply);
      return;
    }
    // P1c: unrecognized commands go to the boot module's handler when one is
    // installed. NOTE: default-channel echoes (the main thread's
    // 'setimmediate' branch bounces our replies back) land here too, so the
    // module handler MUST silently ignore cmds outside its own protocol
    // (engine_realm_boot.mjs does).
    if (moduleCommandHandler !== null) {
      try {
        // Second respond arg = optional transfer list (e.g. the boot module's
        // MSS sample-byte copies and opfsReadRange payloads move, not clone).
        moduleCommandHandler(msg, function (payload, transfer) {
          respond(replyPort, payload, transfer);
        });
      } catch (error) {
        respond(replyPort, {
          cmd: "moduleCommandError",
          sourceCmd: cmd,
          error: String((error && error.stack) || error),
        });
      }
      return;
    }
    // Unknown cmd with no module handler: ignore silently.
  }

  self.addEventListener("message", function (event) {
    var data = event && event.data;
    if (!data || typeof data !== "object" || !data.__cncRealm) {
      return; // not ours — emscripten's own protocol, leave untouched.
    }
    var msg = data.__cncRealm;
    if (msg && msg.cmd === "connect" && event.ports && event.ports[0]) {
      connectedPort = event.ports[0];
      connectedPort.onmessage = function (portEvent) {
        var portData = portEvent && portEvent.data;
        if (!portData || typeof portData !== "object" || !portData.__cncRealm) {
          return;
        }
        handleCommand(portData.__cncRealm, connectedPort);
      };
      respond(connectedPort, { cmd: "connected", isPthread: true });
      return;
    }
    handleCommand(msg, connectedPort);
  });
})();
