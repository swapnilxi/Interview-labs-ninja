'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { confirmDialog } from '@/lib/ui/confirm';
import SchedulerView, { EDIT_SCHEDULE_EVENT } from '../SchedulerView';
import AssistantThread from './AssistantThread';
import AssistantComposer from './AssistantComposer';
import VoiceMode, { VoiceSettingsPanel } from './VoiceMode';
import { useAssistant } from './useAssistant';
import {
  DEFAULT_VOICE,
  deviceVoices,
  loadVoiceSettings,
  saveVoiceSettings,
  speaker,
  textToSay,
  type VoiceSettings,
} from './voice';

/**
 * To-Do → Assistant (`/ai-todo?tab=schedule`). A chat, like ChatGPT with tasks: ask about your tasks, projects and goals,
 * get a report, look something up on the web, or have something run on a schedule, by typing or by voice. Beside it
 * (below lg: behind the Chat / Scheduled switch) is the list of what's scheduled. Scheduled AI jobs post their results
 * into the conversation.
 *
 * Server: POST /todo/agent/chat (backend/modules/ai_todo/agent ↔ fe-apis/todo/agent). Client: lib/services/agentService.ts.
 */

type Pane = 'chat' | 'scheduled';

export default function AssistantView() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = Number(params.get('schedule')) || null;
  const focusRun = Number(params.get('run')) || null;

  const assistant = useAssistant();
  const { timeline, busy, send } = assistant;
  const [pane, setPane] = useState<Pane>(focusId && !focusRun ? 'scheduled' : 'chat');
  const [count, setCount] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceSettings>(DEFAULT_VOICE);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const voiceOpenRef = useRef(false);
  voiceOpenRef.current = voiceOpen;

  useEffect(() => {
    setVoice(loadVoiceSettings());
    deviceVoices(); // starts loading the device's voices, so the first answer has them
    return () => speaker.stop();
  }, []);

  // A notification for a job result opens `&run=<id>`: if that result isn't in the conversation, show the schedule.
  useEffect(() => {
    if (!focusRun || !assistant.runsLoaded) return;
    if (!timeline.some((r) => r.kind === 'run' && r.run.id === focusRun)) setPane('scheduled');
  }, [focusRun, assistant.runsLoaded, timeline]);

  const scrollToEnd = useCallback((smooth = true) => {
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
    );
  }, []);

  // Open on the latest messages (unless a notification asked for a particular result).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !assistant.ready) return;
    opened.current = true;
    if (!focusRun && timeline.length > 2) scrollToEnd(false);
  }, [assistant.ready, timeline.length, focusRun, scrollToEnd]);

  useEffect(() => {
    if (busy) scrollToEnd();
  }, [busy, scrollToEnd]);

  const say = useCallback(
    (id: string, text: string) => {
      setSpeakingId(id);
      void speaker
        .speak(text, voice)
        .finally(() => setSpeakingId((cur) => (cur === id ? null : cur)));
    },
    [voice]
  );

  const onSpeak = (id: string, text: string) => {
    if (speakingId === id) {
      speaker.stop();
      setSpeakingId(null);
      return;
    }
    say(id, textToSay(text, undefined, 5000));
  };

  const onSend = async (text: string, opts: { voice: boolean }) => {
    setDraft('');
    speaker.stop();
    setSpeakingId(null);
    const reply = await send(text, opts);
    scrollToEnd();
    if (opts.voice && voice.autoSpeak && reply && !reply.failed && !voiceOpenRef.current) {
      say(reply.id, textToSay(reply.text, reply.speech));
    }
  };

  const onSuggest = (text: string) => {
    setDraft(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
    });
  };

  const changeVoice = (next: VoiceSettings) => {
    setVoice(next);
    saveVoiceSettings(next);
  };

  const openSchedule = (id: number, runId?: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', 'schedule');
    next.set('schedule', String(id));
    if (runId) next.set('run', String(runId));
    else next.delete('run');
    router.replace(`/ai-todo?${next.toString()}`, { scroll: false });
    setPane('scheduled');
  };

  const editSchedule = (id: number) => {
    window.dispatchEvent(new CustomEvent(EDIT_SCHEDULE_EVENT, { detail: id }));
  };

  const newChat = async () => {
    if (!timeline.length) return;
    const ok = await confirmDialog({
      title: 'Start a new chat?',
      message:
        'This conversation is cleared from this device. Your schedules, tasks and job history stay.',
      confirmLabel: 'New chat',
    });
    if (!ok) return;
    speaker.stop();
    setSpeakingId(null);
    assistant.clear();
  };

  return (
    <div className="agt-view" data-pane={pane}>
      <section className="agt-main" aria-label="Assistant">
        <header className="agt-head">
          <div className="min-w-0">
            <h2 className="todo-section-title font-semibold">Assistant</h2>
            <p className="todo-section-sub">
              Ask, get reports, or put anything on a schedule. Type or talk.
            </p>
          </div>
          <div className="agt-head-actions">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="todo-btn todo-btn-ghost h-9 w-9 px-0"
              aria-label="Voice settings"
              title="Voice settings"
            >
              <Icon name="SpeakerWaveIcon" size={17} />
            </button>
            <button
              type="button"
              onClick={() => void newChat()}
              disabled={!timeline.length || busy}
              className="todo-btn todo-btn-ghost h-9 px-2.5 text-sm"
              title="Start a new chat"
            >
              <Icon name="PencilSquareIcon" size={16} />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </header>

        <PaneSwitch pane={pane} onPane={setPane} count={count} />

        <AssistantThread
          timeline={timeline}
          busy={busy}
          speakingId={speakingId}
          focusRun={focusRun}
          onSuggest={onSuggest}
          onSpeak={onSpeak}
          onRetry={(id) => void assistant.retry(id)}
          onUndo={(itemId, i) => void assistant.undo(itemId, i)}
          onConfirm={(itemId, i, yes) => void assistant.confirm(itemId, i, yes)}
          onEditSchedule={editSchedule}
          onOpenSchedule={openSchedule}
        />

        <AssistantComposer
          value={draft}
          onChange={setDraft}
          onSend={(text, opts) => void onSend(text, opts)}
          onVoiceMode={() => {
            speaker.stop();
            setSpeakingId(null);
            setVoiceOpen(true);
          }}
          busy={busy}
          inputRef={inputRef}
        />
        {/* After the pinned box, so scrolling here leaves the last message above it (not under it). */}
        <div ref={endRef} className="agt-end" aria-hidden />
      </section>

      <aside className="agt-side" aria-label="Scheduled">
        <PaneSwitch pane={pane} onPane={setPane} count={count} />
        <SchedulerView onCount={setCount} />
      </aside>

      <VoiceMode
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        send={send}
        settings={voice}
        onSettings={changeVoice}
        onUndo={(itemId, i) => void assistant.undo(itemId, i)}
        onConfirm={(itemId, i, yes) => void assistant.confirm(itemId, i, yes)}
        onEditSchedule={editSchedule}
        liveItem={(id) => {
          const row = timeline.find((r) => r.kind === 'message' && r.item.id === id);
          return row && row.kind === 'message' ? row.item : undefined;
        }}
      />

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        labelledBy="agt-voice-settings-title"
        className="w-full max-w-[26rem] rounded-[1.25rem] bg-card p-[1.25rem] shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 id="agt-voice-settings-title" className="text-base font-semibold text-foreground">
            Voice
          </h3>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="todo-btn todo-btn-ghost h-9 w-9 px-0"
            aria-label="Close"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <VoiceSettingsPanel settings={voice} onChange={changeVoice} />
      </Modal>
    </div>
  );
}

/** Chat / Scheduled, below lg (where the two don't fit side by side). */
function PaneSwitch({
  pane,
  onPane,
  count,
}: {
  pane: Pane;
  onPane: (p: Pane) => void;
  count: number | null;
}) {
  return (
    <div
      className="todo-segmented mb-[1rem] w-full min-[1100px]:hidden"
      role="group"
      aria-label="Assistant view"
    >
      <button
        type="button"
        aria-pressed={pane === 'chat'}
        className="todo-segment flex-1"
        onClick={() => onPane('chat')}
      >
        <Icon name="ChatBubbleLeftRightIcon" size={15} />
        Chat
      </button>
      <button
        type="button"
        aria-pressed={pane === 'scheduled'}
        className="todo-segment flex-1"
        onClick={() => onPane('scheduled')}
      >
        <Icon name="ClockIcon" size={15} />
        Scheduled{count ? ` · ${count}` : ''}
      </button>
    </div>
  );
}
