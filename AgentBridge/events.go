package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxEventObjectIDs = 128

type eventRuntimeConfig struct {
	pollInterval       time.Duration
	capabilityInterval time.Duration
	coalesceWindow     time.Duration
	idleTimeout        time.Duration
	heartbeatInterval  time.Duration
	replayLimit        int
	requestTimeout     time.Duration
}

func eventConfig(config Config) eventRuntimeConfig {
	result := eventRuntimeConfig{
		pollInterval:       config.EventPollInterval,
		capabilityInterval: config.EventCapabilityInterval,
		coalesceWindow:     config.EventCoalesceWindow,
		idleTimeout:        config.EventIdleTimeout,
		heartbeatInterval:  config.EventHeartbeatInterval,
		replayLimit:        config.EventReplayLimit,
		requestTimeout:     config.RequestTimeout,
	}
	if result.pollInterval <= 0 {
		result.pollInterval = 250 * time.Millisecond
	}
	if result.capabilityInterval <= 0 {
		result.capabilityInterval = time.Second
	}
	if result.coalesceWindow <= 0 {
		result.coalesceWindow = 500 * time.Millisecond
	}
	if result.idleTimeout <= 0 {
		result.idleTimeout = 30 * time.Second
	}
	if result.heartbeatInterval <= 0 {
		result.heartbeatInterval = 15 * time.Second
	}
	if result.replayLimit <= 0 {
		result.replayLimit = 2048
	}
	return result
}

type eventSeverity string

const (
	severityInfo     eventSeverity = "info"
	severityNotice   eventSeverity = "notice"
	severityWarning  eventSeverity = "warning"
	severityCritical eventSeverity = "critical"
)

func severityRank(severity eventSeverity) int {
	switch severity {
	case severityInfo:
		return 0
	case severityNotice:
		return 1
	case severityWarning:
		return 2
	case severityCritical:
		return 3
	default:
		return -1
	}
}

type eventArea struct {
	MinX        float64 `json:"minX"`
	MinY        float64 `json:"minY"`
	MaxX        float64 `json:"maxX"`
	MaxY        float64 `json:"maxY"`
	initialized bool
}

func (a *eventArea) include(position []float64) {
	if len(position) < 2 {
		return
	}
	if !a.initialized {
		a.MinX, a.MaxX = position[0], position[0]
		a.MinY, a.MaxY = position[1], position[1]
		a.initialized = true
		return
	}
	if position[0] < a.MinX {
		a.MinX = position[0]
	}
	if position[0] > a.MaxX {
		a.MaxX = position[0]
	}
	if position[1] < a.MinY {
		a.MinY = position[1]
	}
	if position[1] > a.MaxY {
		a.MaxY = position[1]
	}
}

func (a eventArea) intersects(other eventArea) bool {
	return a.MaxX >= other.MinX && a.MinX <= other.MaxX &&
		a.MaxY >= other.MinY && a.MinY <= other.MaxY
}

type tacticalEvent struct {
	Cursor          uint64         `json:"cursor"`
	Type            string         `json:"type"`
	Severity        eventSeverity  `json:"severity"`
	Wake            bool           `json:"wake"`
	Frame           uint64         `json:"frame"`
	SnapshotID      uint64         `json:"snapshotId"`
	ObservationMode string         `json:"observationMode"`
	Relationship    string         `json:"relationship,omitempty"`
	ObjectIDs       []int64        `json:"objectIds,omitempty"`
	Area            *eventArea     `json:"area,omitempty"`
	Summary         string         `json:"summary"`
	Details         map[string]any `json:"details,omitempty"`
}

type eventEconomy struct {
	Money            int64 `json:"money"`
	PowerProduction  int64 `json:"powerProduction"`
	PowerConsumption int64 `json:"powerConsumption"`
	PowerSufficient  bool  `json:"powerSufficient"`
	Rank             int64 `json:"rank"`
	SkillPoints      int64 `json:"skillPoints"`
	SciencePoints    int64 `json:"sciencePurchasePoints"`
}

type eventPlayer struct {
	Index        int64         `json:"index"`
	Name         string        `json:"name"`
	Side         string        `json:"side"`
	Local        bool          `json:"local"`
	Relationship string        `json:"relationship"`
	Active       bool          `json:"active"`
	Economy      *eventEconomy `json:"economy"`
}

type eventObject struct {
	ID           int64     `json:"id"`
	Template     string    `json:"template"`
	Owner        *int64    `json:"owner"`
	Relationship string    `json:"relationship"`
	Position     []float64 `json:"position"`
	Health       []float64 `json:"health"`
	Construction float64   `json:"construction"`
	Status       []string  `json:"status"`
}

type eventCommandState struct {
	Complete *bool `json:"complete"`
	Ready    *bool `json:"ready"`
}

type eventProductionEntry struct {
	ID   uint64 `json:"id"`
	Type string `json:"type"`
	Name string `json:"name"`
}

type eventObjectCapabilities struct {
	CommandState    map[string]eventCommandState `json:"commandState"`
	ProductionQueue []eventProductionEntry       `json:"productionQueue"`
}

type eventWorldSnapshot struct {
	OK              bool   `json:"ok"`
	SnapshotID      uint64 `json:"snapshotId"`
	Frame           uint64 `json:"frame"`
	ObservationMode string `json:"observationMode"`
	Game            struct {
		Mode            string  `json:"mode"`
		Playable        bool    `json:"playable"`
		EndFrame        uint64  `json:"endFrame"`
		Outcome         *string `json:"outcome"`
		OutcomeRetained bool    `json:"outcomeRetained"`
	} `json:"game"`
	Scoreboard         []eventScoreboardEntry             `json:"scoreboard"`
	LocalPlayerIndex   int64                              `json:"localPlayerIndex"`
	Players            []eventPlayer                      `json:"players"`
	Objects            []eventObject                      `json:"objects"`
	ObjectCapabilities map[string]eventObjectCapabilities `json:"objectCapabilities"`
	Truncated          bool                               `json:"truncated"`
}

type eventScoreboardEntry struct {
	Index              int64  `json:"index"`
	Name               string `json:"name"`
	Side               string `json:"side"`
	Type               string `json:"type"`
	Relationship       string `json:"relationship"`
	Local              bool   `json:"local"`
	Observer           bool   `json:"observer"`
	Outcome            string `json:"outcome"`
	Score              int64  `json:"score"`
	UnitsBuilt         int64  `json:"unitsBuilt"`
	UnitsLost          int64  `json:"unitsLost"`
	UnitsDestroyed     int64  `json:"unitsDestroyed"`
	BuildingsBuilt     int64  `json:"buildingsBuilt"`
	BuildingsLost      int64  `json:"buildingsLost"`
	BuildingsDestroyed int64  `json:"buildingsDestroyed"`
	MoneyEarned        int64  `json:"moneyEarned"`
	MoneySpent         int64  `json:"moneySpent"`
}

type eventHUDMessage struct {
	Text  string `json:"text"`
	Frame uint64 `json:"frame"`
	Color uint32 `json:"color"`
}

type eventHUDPopup struct {
	Text        string `json:"text"`
	X           int64  `json:"x"`
	Y           int64  `json:"y"`
	Width       int64  `json:"width"`
	Color       uint32 `json:"color"`
	PausesGame  bool   `json:"pausesGame"`
	PausesMusic bool   `json:"pausesMusic"`
}

type eventHUDSubtitle struct {
	Lines []string `json:"lines"`
}

type eventHUDTimer struct {
	Name      string `json:"name"`
	Text      string `json:"text"`
	Countdown bool   `json:"countdown"`
}

type eventHUDSnapshot struct {
	OK              bool              `json:"ok"`
	Frame           uint64            `json:"frame"`
	MessagesVisible bool              `json:"messagesVisible"`
	Messages        []eventHUDMessage `json:"messages"`
	Popup           *eventHUDPopup    `json:"popup"`
	Subtitle        *eventHUDSubtitle `json:"subtitle"`
	TimersVisible   bool              `json:"timersVisible"`
	Timers          []eventHUDTimer   `json:"timers"`
}

func (s *eventWorldSnapshot) relationship(object eventObject) string {
	if object.Owner != nil && *object.Owner == s.LocalPlayerIndex {
		return "self"
	}
	return object.Relationship
}

type eventAccumulator struct {
	events map[string]*tacticalEvent
}

func newEventAccumulator() *eventAccumulator {
	return &eventAccumulator{events: make(map[string]*tacticalEvent)}
}

func (a *eventAccumulator) add(
	event tacticalEvent,
	object *eventObject,
	change map[string]any,
) {
	key := event.Type + "\x00" + event.Relationship
	current := a.events[key]
	if current == nil {
		copy := event
		copy.Details = map[string]any{"changes": []any{}}
		current = &copy
		a.events[key] = current
	}
	if severityRank(event.Severity) > severityRank(current.Severity) {
		current.Severity = event.Severity
	}
	current.Wake = current.Wake || event.Wake
	current.Frame = event.Frame
	current.SnapshotID = event.SnapshotID
	current.Summary = event.Summary
	if object == nil {
		for key, value := range change {
			current.Details[key] = value
		}
		return
	}
	if len(current.ObjectIDs) < maxEventObjectIDs && !containsObjectID(current.ObjectIDs, object.ID) {
		current.ObjectIDs = append(current.ObjectIDs, object.ID)
	}
	if len(object.Position) >= 2 {
		if current.Area == nil {
			current.Area = &eventArea{}
		}
		current.Area.include(object.Position)
	}
	changes, _ := current.Details["changes"].([]any)
	if len(changes) >= maxEventObjectIDs {
		return
	}
	if change == nil {
		change = make(map[string]any)
	}
	change["id"] = object.ID
	change["template"] = object.Template
	changes = append(changes, change)
	current.Details["changes"] = changes
	current.Details["count"] = len(changes)
}

func (a *eventAccumulator) sorted() []tacticalEvent {
	keys := make([]string, 0, len(a.events))
	for key := range a.events {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]tacticalEvent, 0, len(keys))
	for _, key := range keys {
		event := *a.events[key]
		sort.Slice(event.ObjectIDs, func(i, j int) bool { return event.ObjectIDs[i] < event.ObjectIDs[j] })
		if changes, ok := event.Details["changes"].([]any); ok && len(changes) == 0 {
			delete(event.Details, "changes")
		}
		result = append(result, event)
	}
	return result
}

func containsObjectID(ids []int64, id int64) bool {
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
}

func hasStatus(statuses []string, wanted string) bool {
	for _, status := range statuses {
		if status == wanted {
			return true
		}
	}
	return false
}

func objectMap(objects []eventObject) map[int64]eventObject {
	result := make(map[int64]eventObject, len(objects))
	for _, object := range objects {
		result[object.ID] = object
	}
	return result
}

func playerMap(players []eventPlayer) map[int64]eventPlayer {
	result := make(map[int64]eventPlayer, len(players))
	for _, player := range players {
		result[player.Index] = player
	}
	return result
}

func baseEvent(snapshot *eventWorldSnapshot, eventType string) tacticalEvent {
	return tacticalEvent{
		Type:            eventType,
		Severity:        severityInfo,
		Frame:           snapshot.Frame,
		SnapshotID:      snapshot.SnapshotID,
		ObservationMode: snapshot.ObservationMode,
	}
}

func diffEventSnapshots(previous, current *eventWorldSnapshot) []tacticalEvent {
	accumulator := newEventAccumulator()
	if previous == nil {
		event := baseEvent(current, "stream.baseline")
		event.Summary = "Tactical event baseline is ready"
		accumulator.add(event, nil, map[string]any{
			"gameMode":    current.Game.Mode,
			"objectCount": len(current.Objects),
			"truncated":   current.Truncated,
		})
		if current.Game.Outcome != nil {
			addOutcomeEvent(accumulator, current)
		}
		return accumulator.sorted()
	}

	if !previous.Game.Playable && current.Game.Playable {
		event := baseEvent(current, "game.started")
		event.Severity = severityNotice
		event.Wake = true
		event.Summary = "A playable match started"
		accumulator.add(event, nil, map[string]any{"mode": current.Game.Mode})
	}
	if current.Game.Outcome != nil &&
		(previous.Game.Outcome == nil || *previous.Game.Outcome != *current.Game.Outcome) {
		addOutcomeEvent(accumulator, current)
	}

	previousPlayers := playerMap(previous.Players)
	for _, player := range current.Players {
		old, existed := previousPlayers[player.Index]
		if !existed {
			continue
		}
		relationship := player.Relationship
		if player.Local {
			relationship = "self"
		}
		if old.Active && !player.Active {
			event := baseEvent(current, "player.eliminated")
			event.Relationship = relationship
			event.Severity = severityWarning
			event.Wake = true
			if player.Local {
				event.Severity = severityCritical
			}
			event.Summary = player.Name + " is no longer active"
			accumulator.add(event, nil, map[string]any{
				"playerIndex": player.Index, "name": player.Name, "side": player.Side,
			})
		}
		if player.Local && old.Economy != nil && player.Economy != nil {
			addEconomyEvents(accumulator, current, *old.Economy, *player.Economy)
		}
	}

	previousObjects := objectMap(previous.Objects)
	currentObjects := objectMap(current.Objects)
	for _, object := range current.Objects {
		old, existed := previousObjects[object.ID]
		relationship := current.relationship(object)
		if !existed {
			eventType, summary := "object.appeared", "An observable object appeared"
			severity, wake := severityInfo, false
			if relationship == "enemies" {
				eventType, summary = "enemy.spotted", "Enemy contacts entered observation"
				severity, wake = severityWarning, true
			} else if relationship == "self" && object.Construction < 0.999 {
				eventType, summary = "construction.started", "Construction started"
			} else if relationship == "self" {
				eventType, summary = "production.completed", "A locally controlled object became available"
				severity, wake = severityNotice, true
			}
			event := baseEvent(current, eventType)
			event.Relationship, event.Severity, event.Wake, event.Summary = relationship, severity, wake, summary
			accumulator.add(event, &object, map[string]any{"construction": object.Construction})
			continue
		}

		if len(old.Health) >= 2 && len(object.Health) >= 2 && old.Health[0] > object.Health[0]+0.5 {
			lost := old.Health[0] - object.Health[0]
			fraction := 0.0
			if old.Health[1] > 0 {
				fraction = lost / old.Health[1]
			}
			event := baseEvent(current, "combat.damage")
			event.Relationship = relationship
			event.Summary = "Observable units or structures took damage"
			if relationship == "self" || relationship == "allies" {
				event.Severity, event.Wake = severityWarning, true
			} else {
				event.Severity = severityInfo
			}
			accumulator.add(event, &object, map[string]any{
				"healthBefore": old.Health[0], "health": object.Health[0],
				"healthMax": object.Health[1], "healthLost": lost, "lossFraction": fraction,
			})
		}
		if old.Construction < 0.999 && object.Construction >= 0.999 {
			event := baseEvent(current, "construction.completed")
			event.Relationship = relationship
			event.Severity, event.Wake = severityNotice, relationship == "self"
			event.Summary = "Construction completed"
			accumulator.add(event, &object, nil)
		}
		if !hasStatus(old.Status, "destroyed") && hasStatus(object.Status, "destroyed") {
			event := baseEvent(current, "object.destroyed")
			event.Relationship = relationship
			event.Severity, event.Wake = severityWarning, true
			if relationship == "self" {
				event.Severity = severityCritical
			}
			event.Summary = "An observable object was destroyed"
			accumulator.add(event, &object, nil)
		}
		if relationship == "enemies" &&
			(!hasStatus(old.Status, "attacking") && hasStatus(object.Status, "attacking")) {
			event := baseEvent(current, "combat.threat")
			event.Relationship = relationship
			event.Severity, event.Wake = severityWarning, true
			event.Summary = "Observed enemies began attacking"
			accumulator.add(event, &object, nil)
		}
	}

	for _, object := range previous.Objects {
		if _, exists := currentObjects[object.ID]; exists {
			continue
		}
		relationship := previous.relationship(object)
		event := baseEvent(current, "object.lostSight")
		event.Relationship = relationship
		event.Summary = "Objects left the observable state; destruction is not implied"
		if relationship == "self" {
			event.Type = "object.disappeared"
			event.Severity, event.Wake = severityWarning, true
			event.Summary = "A locally controlled object left the observable state"
		}
		accumulator.add(event, &object, nil)
	}

	addCapabilityEvents(accumulator, previous, current)
	return accumulator.sorted()
}

func equalHUDPopup(left, right *eventHUDPopup) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func equalHUDSubtitle(left, right *eventHUDSubtitle) bool {
	if left == nil || right == nil {
		return left == right
	}
	return slices.Equal(left.Lines, right.Lines)
}

func baseHUDEvent(world *eventWorldSnapshot, hud *eventHUDSnapshot, eventType string) tacticalEvent {
	event := baseEvent(world, eventType)
	if hud.Frame != 0 {
		event.Frame = hud.Frame
	}
	return event
}

func diffHUDSnapshots(
	previous, current *eventHUDSnapshot,
	world *eventWorldSnapshot,
) []tacticalEvent {
	if previous == nil || current == nil {
		return nil
	}
	events := make([]tacticalEvent, 0, 4)

	previousMessages := make(map[eventHUDMessage]struct{}, len(previous.Messages))
	for _, message := range previous.Messages {
		previousMessages[message] = struct{}{}
	}
	newMessages := make([]eventHUDMessage, 0, len(current.Messages))
	for _, message := range current.Messages {
		if _, existed := previousMessages[message]; !existed {
			newMessages = append(newMessages, message)
		}
	}
	if len(newMessages) != 0 {
		event := baseHUDEvent(world, current, "hud.message")
		event.Severity, event.Wake = severityNotice, true
		event.Summary = "New visible HUD messages arrived"
		event.Details = map[string]any{"messages": newMessages, "newestFirst": true}
		events = append(events, event)
	}

	if !equalHUDPopup(previous.Popup, current.Popup) {
		eventType := "hud.popup"
		summary := "A visible popup briefing changed"
		details := map[string]any{"popup": current.Popup}
		severity, wake := severityNotice, true
		if current.Popup == nil {
			eventType, summary = "hud.popupClosed", "The visible popup briefing closed"
			severity, wake = severityInfo, false
			delete(details, "popup")
		} else if current.Popup.PausesGame {
			severity = severityCritical
		}
		event := baseHUDEvent(world, current, eventType)
		event.Severity, event.Wake, event.Summary, event.Details = severity, wake, summary, details
		events = append(events, event)
	}

	if !equalHUDSubtitle(previous.Subtitle, current.Subtitle) && current.Subtitle != nil {
		event := baseHUDEvent(world, current, "hud.subtitle")
		event.Severity = severityInfo
		event.Wake = previous.Subtitle == nil
		if event.Wake {
			event.Severity = severityNotice
		}
		event.Summary = "Currently revealed military subtitle text changed"
		event.Details = map[string]any{"lines": current.Subtitle.Lines}
		events = append(events, event)
	}

	if current.TimersVisible && !slices.Equal(previous.Timers, current.Timers) {
		event := baseHUDEvent(world, current, "hud.timer")
		event.Severity, event.Wake = severityInfo, false
		event.Summary = "Visible named timers changed"
		event.Details = map[string]any{"timers": current.Timers}
		events = append(events, event)
	}
	return events
}

func addOutcomeEvent(accumulator *eventAccumulator, snapshot *eventWorldSnapshot) {
	event := baseEvent(snapshot, "game.outcome")
	event.Severity, event.Wake = severityCritical, true
	event.Summary = "The match reached an authoritative terminal outcome"
	details := map[string]any{
		"outcome": *snapshot.Game.Outcome, "endFrame": snapshot.Game.EndFrame,
		"retained": snapshot.Game.OutcomeRetained,
	}
	if len(snapshot.Scoreboard) != 0 {
		details["scoreboard"] = snapshot.Scoreboard
	}
	accumulator.add(event, nil, details)
}

func addEconomyEvents(
	accumulator *eventAccumulator,
	snapshot *eventWorldSnapshot,
	previous, current eventEconomy,
) {
	if previous.Money != current.Money {
		event := baseEvent(snapshot, "economy.changed")
		event.Relationship = "self"
		event.Summary = "Local funds changed"
		accumulator.add(event, nil, map[string]any{
			"moneyBefore": previous.Money, "money": current.Money,
			"delta": current.Money - previous.Money,
		})
	}
	if previous.PowerSufficient != current.PowerSufficient {
		event := baseEvent(snapshot, "power.changed")
		event.Relationship = "self"
		event.Severity, event.Wake = severityNotice, true
		if !current.PowerSufficient {
			event.Severity = severityWarning
		}
		event.Summary = "Local power sufficiency changed"
		accumulator.add(event, nil, map[string]any{
			"sufficient":  current.PowerSufficient,
			"production":  current.PowerProduction,
			"consumption": current.PowerConsumption,
		})
	}
	if previous.Rank != current.Rank || previous.SciencePoints != current.SciencePoints ||
		previous.SkillPoints != current.SkillPoints {
		event := baseEvent(snapshot, "player.progress")
		event.Relationship = "self"
		event.Severity, event.Wake = severityNotice, true
		event.Summary = "Local rank or skill points changed"
		accumulator.add(event, nil, map[string]any{
			"rank": current.Rank, "skillPoints": current.SkillPoints,
			"sciencePurchasePoints": current.SciencePoints,
		})
	}
}

func addCapabilityEvents(
	accumulator *eventAccumulator,
	previous, current *eventWorldSnapshot,
) {
	if current.ObjectCapabilities == nil || previous.ObjectCapabilities == nil {
		return
	}
	objects := objectMap(current.Objects)
	for key, capability := range current.ObjectCapabilities {
		old, existed := previous.ObjectCapabilities[key]
		if !existed {
			continue
		}
		id, err := strconv.ParseInt(key, 10, 64)
		if err != nil {
			continue
		}
		object, observable := objects[id]
		if !observable {
			continue
		}
		relationship := current.relationship(object)
		if queueSignature(old.ProductionQueue) != queueSignature(capability.ProductionQueue) {
			event := baseEvent(current, "production.queueChanged")
			event.Relationship = relationship
			event.Severity = severityInfo
			event.Summary = "A production queue changed"
			accumulator.add(event, &object, map[string]any{
				"queue": capability.ProductionQueue,
			})
		}
		for name, state := range capability.CommandState {
			oldState, existed := old.CommandState[name]
			if !existed {
				continue
			}
			if state.Ready != nil && *state.Ready && (oldState.Ready == nil || !*oldState.Ready) {
				event := baseEvent(current, "capability.ready")
				event.Relationship = relationship
				event.Severity, event.Wake = severityNotice, relationship == "self"
				event.Summary = "A special power became ready"
				accumulator.add(event, &object, map[string]any{"command": name})
			}
			if state.Complete != nil && *state.Complete &&
				(oldState.Complete == nil || !*oldState.Complete) {
				event := baseEvent(current, "upgrade.completed")
				event.Relationship = relationship
				event.Severity, event.Wake = severityNotice, relationship == "self"
				event.Summary = "An upgrade completed"
				accumulator.add(event, &object, map[string]any{"command": name})
			}
		}
	}
}

func queueSignature(queue []eventProductionEntry) string {
	encoded, _ := json.Marshal(queue)
	return string(encoded)
}

type eventManager struct {
	session *Session
	config  eventRuntimeConfig
	mu      sync.Mutex
	streams map[string]*eventStream
}

func newEventManager(session *Session, config eventRuntimeConfig) *eventManager {
	return &eventManager{session: session, config: config, streams: make(map[string]*eventStream)}
}

func (m *eventManager) stream(mode string) *eventStream {
	m.mu.Lock()
	defer m.mu.Unlock()
	stream := m.streams[mode]
	if stream == nil {
		stream = newEventStream(m.session, mode, m.config)
		m.streams[mode] = stream
	}
	return stream
}

type eventSubscription struct {
	stream            *eventStream
	id                uint64
	needsCapabilities bool
	needsHUD          bool
	Notify            <-chan struct{}
	once              sync.Once
}

func (s *eventSubscription) close() {
	s.once.Do(func() { s.stream.unsubscribe(s.id, s.needsCapabilities, s.needsHUD) })
}

type eventStream struct {
	session *Session
	mode    string
	config  eventRuntimeConfig

	mu                    sync.Mutex
	events                []tacticalEvent
	nextCursor            uint64
	subscribers           map[uint64]chan struct{}
	capabilitySubscribers int
	hudSubscribers        int
	nextSubscriber        uint64
	runCancel             context.CancelFunc
	idleTimer             *time.Timer
	gapCursor             uint64
	previous              *eventWorldSnapshot
	previousHUD           *eventHUDSnapshot
	pending               map[string]*tacticalEvent
}

func newEventStream(session *Session, mode string, config eventRuntimeConfig) *eventStream {
	return &eventStream{
		session: session, mode: mode, config: config,
		subscribers: make(map[uint64]chan struct{}), pending: make(map[string]*tacticalEvent),
	}
}

func (s *eventStream) subscribe(needsCapabilities, needsHUD bool) *eventSubscription {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.idleTimer != nil {
		s.idleTimer.Stop()
		s.idleTimer = nil
	}
	s.nextSubscriber++
	notify := make(chan struct{}, 1)
	s.subscribers[s.nextSubscriber] = notify
	if needsCapabilities {
		s.capabilitySubscribers++
	}
	if needsHUD {
		s.hudSubscribers++
	}
	if s.runCancel == nil {
		ctx, cancel := context.WithCancel(s.session.ctx)
		s.runCancel = cancel
		go s.run(ctx)
	}
	return &eventSubscription{
		stream: s, id: s.nextSubscriber, needsCapabilities: needsCapabilities,
		needsHUD: needsHUD, Notify: notify,
	}
}

func (s *eventStream) unsubscribe(id uint64, needsCapabilities, needsHUD bool) {
	s.mu.Lock()
	if _, exists := s.subscribers[id]; !exists {
		s.mu.Unlock()
		return
	}
	delete(s.subscribers, id)
	if needsCapabilities {
		s.capabilitySubscribers--
	}
	if needsHUD {
		s.hudSubscribers--
		if s.hudSubscribers == 0 {
			s.previousHUD = nil
		}
	}
	if len(s.subscribers) == 0 && s.idleTimer == nil {
		s.idleTimer = time.AfterFunc(s.config.idleTimeout, s.stopIdle)
	}
	s.mu.Unlock()
}

func (s *eventStream) needsCapabilities() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.capabilitySubscribers > 0
}

func (s *eventStream) needsHUD() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hudSubscribers > 0
}

func (s *eventStream) stopIdle() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.idleTimer = nil
	if len(s.subscribers) != 0 || s.runCancel == nil {
		return
	}
	s.runCancel()
	s.runCancel = nil
	s.previous = nil
	s.previousHUD = nil
	s.pending = make(map[string]*tacticalEvent)
	s.gapCursor = s.nextCursor + 1
}

func (s *eventStream) run(ctx context.Context) {
	poll := time.NewTicker(s.config.pollInterval)
	flush := time.NewTicker(s.config.coalesceWindow)
	defer poll.Stop()
	defer flush.Stop()
	lastCapabilities := time.Time{}
	if includeCapabilities := s.needsCapabilities(); includeCapabilities {
		s.poll(ctx, true)
		lastCapabilities = time.Now()
	} else {
		s.poll(ctx, false)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-poll.C:
			includeCapabilities := s.needsCapabilities() &&
				(lastCapabilities.IsZero() || time.Since(lastCapabilities) >= s.config.capabilityInterval)
			s.poll(ctx, includeCapabilities)
			if includeCapabilities {
				lastCapabilities = time.Now()
			}
		case <-flush.C:
			s.flushPending()
		}
	}
}

func (s *eventStream) poll(parent context.Context, includeCapabilities bool) {
	ctx, cancel := context.WithTimeout(parent, s.config.requestTimeout)
	defer cancel()
	result, protocolErr, err := s.session.call(ctx, "world.snapshot", map[string]any{
		"mode": s.mode, "detail": "tactical", "includeCapabilities": includeCapabilities,
	})
	if err != nil || protocolErr != nil {
		return
	}
	var snapshot eventWorldSnapshot
	if json.Unmarshal(result, &snapshot) != nil || !snapshot.OK {
		return
	}
	var hud *eventHUDSnapshot
	if s.needsHUD() && s.session.supports("hud.snapshot") {
		hudResult, hudProtocolErr, hudErr := s.session.call(ctx, "hud.snapshot", map[string]any{})
		if hudErr == nil && hudProtocolErr == nil {
			var parsed eventHUDSnapshot
			if json.Unmarshal(hudResult, &parsed) == nil && parsed.OK {
				hud = &parsed
			}
		}
	}

	s.mu.Lock()
	if snapshot.ObjectCapabilities == nil && s.previous != nil {
		snapshot.ObjectCapabilities = s.previous.ObjectCapabilities
	}
	wasBaseline := s.previous == nil
	events := diffEventSnapshots(s.previous, &snapshot)
	s.previous = &snapshot
	if hud != nil && s.hudSubscribers > 0 {
		events = append(events, diffHUDSnapshots(s.previousHUD, hud, &snapshot)...)
		s.previousHUD = hud
	}
	for index := range events {
		s.mergePending(events[index])
	}
	terminal := snapshot.Game.Outcome != nil
	s.mu.Unlock()
	if wasBaseline || terminal {
		s.flushPending()
	}
}

func (s *eventStream) mergePending(event tacticalEvent) {
	key := event.Type + "\x00" + event.Relationship
	current := s.pending[key]
	if current == nil {
		copy := event
		s.pending[key] = &copy
		return
	}
	if severityRank(event.Severity) > severityRank(current.Severity) {
		current.Severity = event.Severity
	}
	current.Wake = current.Wake || event.Wake
	current.Frame, current.SnapshotID = event.Frame, event.SnapshotID
	current.Summary = event.Summary
	if event.Area != nil {
		if current.Area == nil {
			copy := *event.Area
			current.Area = &copy
		} else {
			current.Area.include([]float64{event.Area.MinX, event.Area.MinY})
			current.Area.include([]float64{event.Area.MaxX, event.Area.MaxY})
		}
	}
	for _, id := range event.ObjectIDs {
		if len(current.ObjectIDs) < maxEventObjectIDs && !containsObjectID(current.ObjectIDs, id) {
			current.ObjectIDs = append(current.ObjectIDs, id)
		}
	}
	if current.Details == nil {
		current.Details = make(map[string]any)
	}
	for detailKey, value := range event.Details {
		if detailKey == "changes" {
			existing, _ := current.Details[detailKey].([]any)
			incoming, _ := value.([]any)
			remaining := maxEventObjectIDs - len(existing)
			if remaining > len(incoming) {
				remaining = len(incoming)
			}
			if remaining > 0 {
				existing = append(existing, incoming[:remaining]...)
			}
			current.Details[detailKey] = existing
			current.Details["count"] = len(existing)
			continue
		}
		if detailKey == "messages" {
			existing, _ := current.Details[detailKey].([]eventHUDMessage)
			incoming, _ := value.([]eventHUDMessage)
			combined := append(append([]eventHUDMessage(nil), incoming...), existing...)
			if len(combined) > maxEventObjectIDs {
				combined = combined[:maxEventObjectIDs]
			}
			current.Details[detailKey] = combined
			continue
		}
		current.Details[detailKey] = value
	}
}

func (s *eventStream) flushPending() {
	s.mu.Lock()
	if len(s.pending) == 0 {
		s.mu.Unlock()
		return
	}
	keys := make([]string, 0, len(s.pending))
	for key := range s.pending {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		event := *s.pending[key]
		s.nextCursor++
		event.Cursor = s.nextCursor
		s.events = append(s.events, event)
	}
	if overflow := len(s.events) - s.config.replayLimit; overflow > 0 {
		s.events = append([]tacticalEvent(nil), s.events[overflow:]...)
	}
	s.pending = make(map[string]*tacticalEvent)
	for _, subscriber := range s.subscribers {
		select {
		case subscriber <- struct{}{}:
		default:
		}
	}
	s.mu.Unlock()
}

type eventReplay struct {
	events   []tacticalEvent
	current  uint64
	oldest   uint64
	stale    bool
	overflow bool
	ahead    bool
}

func (s *eventStream) after(cursor uint64) eventReplay {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := eventReplay{
		current: s.nextCursor,
		stale:   cursor > 0 && s.gapCursor > 0 && cursor < s.gapCursor,
	}
	if len(s.events) > 0 {
		result.oldest = s.events[0].Cursor
	} else {
		result.oldest = s.nextCursor + 1
	}
	result.ahead = cursor > s.nextCursor
	result.overflow = cursor > 0 && cursor+1 < result.oldest
	if result.ahead || result.overflow {
		return result
	}
	for _, event := range s.events {
		if event.Cursor > cursor {
			result.events = append(result.events, event)
		}
	}
	return result
}

type eventFilter struct {
	types         map[string]struct{}
	relationships map[string]struct{}
	objectIDs     map[int64]struct{}
	minimum       eventSeverity
	wakeOnly      bool
	region        *eventArea
}

func parseEventFilter(r *http.Request) (eventFilter, error) {
	filter := eventFilter{minimum: severityInfo}
	if raw := r.URL.Query().Get("types"); raw != "" {
		filter.types = make(map[string]struct{})
		for _, eventType := range strings.Split(raw, ",") {
			eventType = strings.TrimSpace(eventType)
			if eventType == "" || len(eventType) > 64 {
				return filter, errors.New("types must be a comma-separated list of event names")
			}
			filter.types[eventType] = struct{}{}
		}
	}
	if raw := r.URL.Query().Get("relationships"); raw != "" {
		filter.relationships = make(map[string]struct{})
		for _, relationship := range strings.Split(raw, ",") {
			relationship = strings.TrimSpace(relationship)
			if relationship != "self" && relationship != "allies" && relationship != "enemies" &&
				relationship != "neutral" && relationship != "unknown" {
				return filter, errors.New("relationships must contain self, allies, enemies, neutral, or unknown")
			}
			filter.relationships[relationship] = struct{}{}
		}
	}
	if raw := r.URL.Query().Get("objectIds"); raw != "" {
		filter.objectIDs = make(map[int64]struct{})
		for _, rawID := range strings.Split(raw, ",") {
			rawID = strings.TrimSpace(rawID)
			id, err := strconv.ParseInt(rawID, 10, 32)
			if err != nil || id < 1 || len(filter.objectIDs) >= maxEventObjectIDs {
				return filter, errors.New("objectIds must contain at most 128 positive 32-bit integers")
			}
			filter.objectIDs[id] = struct{}{}
		}
	}
	if raw := r.URL.Query().Get("minSeverity"); raw != "" {
		filter.minimum = eventSeverity(raw)
		if severityRank(filter.minimum) < 0 {
			return filter, errors.New("minSeverity must be info, notice, warning, or critical")
		}
	}
	if raw := r.URL.Query().Get("wakeOnly"); raw != "" {
		wakeOnly, err := strconv.ParseBool(raw)
		if err != nil {
			return filter, errors.New("wakeOnly must be true or false")
		}
		filter.wakeOnly = wakeOnly
	}
	regionNames := []string{"minX", "minY", "maxX", "maxY"}
	regionValues := make([]float64, len(regionNames))
	regionCount := 0
	for index, name := range regionNames {
		if r.URL.Query().Get(name) == "" {
			continue
		}
		value, err := requiredQueryFloat(r, name)
		if err != nil {
			return filter, err
		}
		regionValues[index] = value
		regionCount++
	}
	if regionCount != 0 && regionCount != len(regionNames) {
		return filter, errors.New("event region requires minX, minY, maxX, and maxY")
	}
	if regionCount == len(regionNames) {
		filter.region = &eventArea{
			MinX: regionValues[0], MinY: regionValues[1],
			MaxX: regionValues[2], MaxY: regionValues[3],
		}
		if filter.region.MinX >= filter.region.MaxX || filter.region.MinY >= filter.region.MaxY {
			return filter, errors.New("event region bounds must be ordered")
		}
	}
	return filter, nil
}

func (f eventFilter) accepts(event tacticalEvent) bool {
	if len(f.types) > 0 {
		if _, accepted := f.types[event.Type]; !accepted {
			return false
		}
	}
	if severityRank(event.Severity) < severityRank(f.minimum) || f.wakeOnly && !event.Wake {
		return false
	}
	if len(f.relationships) > 0 && event.Relationship != "" {
		if _, accepted := f.relationships[event.Relationship]; !accepted {
			return false
		}
	}
	if len(f.objectIDs) > 0 {
		matched := false
		for _, id := range event.ObjectIDs {
			if _, exists := f.objectIDs[id]; exists {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if f.region != nil && (event.Area == nil || !event.Area.intersects(*f.region)) {
		return false
	}
	return true
}

func (f eventFilter) wantsCapabilities() bool {
	if len(f.types) == 0 {
		return true
	}
	for _, eventType := range []string{
		"production.queueChanged", "capability.ready", "upgrade.completed",
	} {
		if _, exists := f.types[eventType]; exists {
			return true
		}
	}
	return false
}

func (f eventFilter) wantsHUD() bool {
	if len(f.types) == 0 {
		return true
	}
	for eventType := range f.types {
		if strings.HasPrefix(eventType, "hud.") {
			return true
		}
	}
	return false
}

func eventCursor(r *http.Request) (uint64, bool, error) {
	header := r.Header.Get("Last-Event-ID")
	query := r.URL.Query().Get("after")
	if header != "" && query != "" && header != query {
		return 0, false, errors.New("after and Last-Event-ID must match when both are provided")
	}
	raw := header
	if raw == "" {
		raw = query
	}
	if raw == "" {
		return 0, false, nil
	}
	cursor, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, false, errors.New("after and Last-Event-ID must be unsigned integers")
	}
	return cursor, true, nil
}

func writeSSE(w http.ResponseWriter, eventName string, id uint64, value any) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if id > 0 {
		if _, err = fmt.Fprintf(w, "id: %d\n", id); err != nil {
			return err
		}
	}
	if _, err = fmt.Fprintf(w, "event: %s\n", eventName); err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", encoded)
	return err
}

func (s *Server) tacticalEvents(w http.ResponseWriter, r *http.Request) {
	mode, err := observationMode(s.config.PlayMode, r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	filter, err := parseEventFilter(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	cursor, cursorProvided, err := eventCursor(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	session := s.sessionFor(w, r)
	if session == nil {
		return
	}
	if !session.supports("world.snapshot") {
		writeError(w, http.StatusNotImplemented, "unsupported_operation",
			"engine session does not advertise world.snapshot")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "stream_unsupported", "HTTP response streaming is unavailable")
		return
	}
	stream := session.events.stream(mode)
	subscription := stream.subscribe(filter.wantsCapabilities(),
		filter.wantsHUD() && session.supports("hud.snapshot"))
	defer subscription.close()

	replay := stream.after(cursor)
	if !cursorProvided {
		cursor = replay.current
		replay = stream.after(cursor)
	}
	if replay.ahead {
		writeError(w, http.StatusBadRequest, "invalid_cursor", "event cursor is ahead of the stream")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprint(w, "retry: 1000\n\n")
	if replay.overflow || replay.stale && cursor > 0 {
		_ = writeSSE(w, "stream.resync", replay.current, map[string]any{
			"reason": "cursorExpired", "currentCursor": replay.current,
			"oldestAvailable": replay.oldest, "observationMode": mode,
		})
		cursor = replay.current
	} else {
		_ = writeSSE(w, "stream.open", 0, map[string]any{
			"protocol": ProtocolVersion, "currentCursor": replay.current,
			"oldestAvailable": replay.oldest, "observationMode": mode,
			"pollMilliseconds":     s.eventsConfig.pollInterval.Milliseconds(),
			"coalesceMilliseconds": s.eventsConfig.coalesceWindow.Milliseconds(),
			"hudEvents":            filter.wantsHUD() && session.supports("hud.snapshot"),
		})
	}
	flusher.Flush()

	heartbeat := time.NewTicker(s.eventsConfig.heartbeatInterval)
	defer heartbeat.Stop()
	for {
		replay = stream.after(cursor)
		if replay.overflow {
			if writeSSE(w, "stream.resync", replay.current, map[string]any{
				"reason": "bufferOverflow", "currentCursor": replay.current,
				"oldestAvailable": replay.oldest, "observationMode": mode,
			}) != nil {
				return
			}
			cursor = replay.current
			flusher.Flush()
		}
		for _, event := range replay.events {
			cursor = event.Cursor
			if !filter.accepts(event) {
				continue
			}
			if writeSSE(w, event.Type, event.Cursor, event) != nil {
				return
			}
			flusher.Flush()
		}
		select {
		case <-r.Context().Done():
			return
		case <-session.closed:
			return
		case <-subscription.Notify:
		case <-heartbeat.C:
			if _, err := fmt.Fprintf(w, ": heartbeat cursor=%d\n\n", replay.current); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
