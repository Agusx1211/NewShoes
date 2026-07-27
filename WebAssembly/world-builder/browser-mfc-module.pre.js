if (typeof globalThis.createWorldBuilderMfcHost !== "function") {
  throw new Error("World Builder browser host did not load");
}
Module["worldBuilderMfcHost"] = globalThis.createWorldBuilderMfcHost(Module);
