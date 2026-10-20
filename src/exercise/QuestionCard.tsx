import { createContext, useContext, useRef, useState } from "react";
import { BLANK } from "../core/exercise";
import type { AnswerValue, QuestionGrade, StudentOption, StudentPart, StudentQuestion } from "../core/exerciseGrade";
import { SKILL_LABELS } from "../core/exerciseSchema";
import "./player.css";

/**
 * The pieces an exercise is shown with, shared by the student's player and
 * the teacher's preview in the editor: a part's heading and one question.
 */

export type AssetUrl = (assetId: string) => string | undefined;

export const LETTERS = "ABCDEF";

const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;

/** Chinese text gets the Chinese font and size; anything with Latin letters reads as Vietnamese. */
export const langOf = (text: string) => (HAN.test(text) && !LATIN.test(text) ? "zh-CN" : "vi");

/** Plays allowed per recording, and how many each has used so far. */
export interface Listens {
  limit: number;
  used: Readonly<Record<string, number>>;
  count(assetId: string): void;
}

export const ListensContext = createContext<Listens>({ limit: 0, used: {}, count: () => {} });

export const listensLeft = (l: Listens, assetId: string) => (l.limit ? Math.max(0, l.limit - (l.used[assetId] ?? 0)) : Infinity);

/** A question's own recording: a play button that respects the listening limit. */
export function AudioClip({ assetId, assetUrl, label }: { assetId: string; assetUrl: AssetUrl; label: string }) {
  const listens = useContext(ListensContext);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = assetUrl(assetId);
  const left = listensLeft(listens, assetId);
  if (!src) return null;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const audio = ref.current;
    if (!audio) return;
    if (!audio.paused) return audio.pause();
    // A play from the start counts as one listen; carrying on after a pause does not.
    const fresh = audio.ended || audio.currentTime < 0.2;
    if (fresh && left <= 0) return;
    if (fresh) {
      audio.currentTime = 0;
      listens.count(assetId);
    }
    void audio.play();
  }

  return (
    <span className="ex-clip">
      <button type="button" className="ex-clip-button" onClick={toggle} disabled={!playing && left <= 0}>
        <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span> {label}
      </button>
      {listens.limit > 0 && <span className="ex-listens">Còn {left} lần nghe</span>}
      <audio ref={ref} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </span>
  );
}

export function PartHeader({
  part,
  index,
  assetUrl,
  onListen,
  transcript,
  selected,
  onSelect,
}: {
  part: StudentPart;
  index: number;
  assetUrl: AssetUrl;
  /** Plays the part's recording in the player's audio bar. */
  onListen?(assetId: string): void;
  /** The recording's words, after handing in. */
  transcript?: string;
  selected?: boolean;
  onSelect?(): void;
}) {
  const image = part.image ? assetUrl(part.image) : undefined;
  return (
    <section className={`ex-part${selected ? " ex-selected" : ""}${onSelect ? " ex-selectable" : ""}`} onClick={onSelect} id={`ex-p-${part.id}`}>
      <p className="ex-skill">
        {SKILL_LABELS[part.skill]} · Phần {index + 1}
      </p>
      {part.title && (
        <h2 className="ex-part-title" lang={langOf(part.title)}>
          {part.title}
        </h2>
      )}
      {part.instruction && (
        <p className="ex-instruction" lang={langOf(part.instruction)}>
          {part.instruction}
        </p>
      )}
      {part.audio && onListen && (
        <button
          type="button"
          className="ex-listen"
          onClick={(e) => {
            e.stopPropagation();
            onListen(part.audio!);
          }}
        >
          🎧 Nghe phần này
        </button>
      )}
      {part.audio && !onListen && <AudioClip assetId={part.audio} assetUrl={assetUrl} label="Nghe file của phần" />}
      {image && <img className="ex-part-image" src={image} alt="" />}
      {part.passage && (
        <div className="ex-passage" lang={langOf(part.passage)}>
          {part.passage}
        </div>
      )}
      {transcript && (
        <details className="ex-transcript">
          <summary>Lời đoạn nghe</summary>
          <p lang={langOf(transcript)}>{transcript}</p>
        </details>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<QuestionGrade["status"], string> = { correct: "Đúng", wrong: "Sai", blank: "Chưa làm" };

function Prompt({ question, gapText, gapState }: { question: StudentQuestion; gapText?: string; gapState?: string }) {
  if (question.type === "blank-choice") {
    const at = question.prompt.indexOf(BLANK);
    const before = at >= 0 ? question.prompt.slice(0, at) : question.prompt;
    const after = at >= 0 ? question.prompt.slice(at + BLANK.length) : "";
    return (
      <p className="ex-prompt" lang="zh-CN">
        {before}
        <span className={`ex-gap${gapState ? ` ex-gap--${gapState}` : ""}`}>{gapText || " "}</span>
        {after}
      </p>
    );
  }
  return question.prompt ? (
    <p className="ex-prompt" lang={langOf(question.prompt)}>
      {question.prompt}
    </p>
  ) : null;
}

function optionsLayout(options: StudentOption[]): string {
  if (options.some((o) => o.image)) return "images";
  return options.every((o) => [...o.text].length <= 12 && [...o.pinyin].length <= 30) ? "grid" : "list";
}

export interface QuestionCardProps {
  question: StudentQuestion;
  number: number;
  assetUrl: AssetUrl;
  /** What the student picked. */
  value?: AnswerValue;
  /** Present while the student can answer. */
  onAnswer?(value: AnswerValue): void;
  /** The right answer, marked after handing in (and in the teacher's preview). */
  expected?: AnswerValue;
  status?: QuestionGrade["status"];
  explanation?: string;
  transcript?: string;
  flagged?: boolean;
  onFlag?(): void;
  selected?: boolean;
  onSelect?(): void;
  /** Teacher's preview: the worst problem the check found in this question. */
  problem?: "error" | "warning";
}

export function QuestionCard(props: QuestionCardProps) {
  const { question: q, number, assetUrl, value, onAnswer, expected, status } = props;
  const answering = !!onAnswer;
  const image = q.image ? assetUrl(q.image) : undefined;
  const marked = expected !== undefined;

  // Buttons stay clickable (not `disabled`) when read-only, so a click still selects the card in the editor.
  const choose = (v: AnswerValue) => (e: React.MouseEvent) => {
    if (!answering) return;
    e.stopPropagation();
    onAnswer!(v);
  };
  const stateOf = (v: AnswerValue) => {
    const chosen = value === v;
    if (marked) return expected === v ? "right" : chosen ? "wrong" : "";
    return chosen ? "chosen" : "";
  };

  const gapOption = q.options?.find((o) => o.id === (marked && status !== "correct" ? expected : value)) ?? q.options?.find((o) => o.id === value);
  const classes = [
    "ex-q",
    props.selected ? "ex-selected" : "",
    props.problem ? `ex-q--${props.problem}` : "",
    status ? `ex-q--${status}` : "",
    props.onSelect ? "ex-selectable" : "",
  ];

  return (
    <article id={`ex-q-${q.id}`} className={classes.filter(Boolean).join(" ")} onClick={props.onSelect}>
      <header className="ex-q-head">
        <span className="ex-q-number">Câu {number}</span>
        {q.points > 1 && <span className="ex-q-points">{q.points} điểm</span>}
        {status && <span className={`ex-q-status ex-q-status--${status}`}>{STATUS_LABEL[status]}</span>}
        {props.problem && (
          <span className={`ex-q-problem ex-q-problem--${props.problem}`}>{props.problem === "error" ? "Cần sửa" : "Nên xem lại"}</span>
        )}
        {props.onFlag && (
          <button
            type="button"
            className="ex-flag"
            aria-pressed={!!props.flagged}
            onClick={(e) => {
              e.stopPropagation();
              props.onFlag!();
            }}
          >
            ⚑ {props.flagged ? "Đã đánh dấu" : "Đánh dấu"}
          </button>
        )}
      </header>
      <Prompt question={q} gapText={gapOption?.text} gapState={marked && gapOption ? (gapOption.id === expected ? "right" : "wrong") : undefined} />
      {q.pinyin && <p className="ex-pinyin">{q.pinyin}</p>}
      {image && <img className="ex-q-image" src={image} alt="" />}
      {q.audio && <AudioClip assetId={q.audio} assetUrl={assetUrl} label="Nghe câu này" />}

      {q.type === "true-false" ? (
        <div className="ex-options" data-layout="tf" role="radiogroup" aria-label={`Câu ${number}`}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={value === v}
              tabIndex={answering ? 0 : -1}
              className={`ex-option ex-option--${stateOf(v) || "none"}`}
              onClick={choose(v)}
            >
              <span className="ex-letter" aria-hidden="true">
                {v ? "✓" : "✗"}
              </span>
              <span className="ex-option-body">{v ? "Đúng" : "Sai"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="ex-options" data-layout={optionsLayout(q.options ?? [])} role="radiogroup" aria-label={`Câu ${number}`}>
          {(q.options ?? []).map((o, i) => {
            const src = o.image ? assetUrl(o.image) : undefined;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={value === o.id}
                tabIndex={answering ? 0 : -1}
                className={`ex-option ex-option--${stateOf(o.id) || "none"}`}
                onClick={choose(o.id)}
              >
                <span className="ex-letter">{LETTERS[i]}</span>
                {src && <img className="ex-option-image" src={src} alt="" />}
                <span className="ex-option-body">
                  {o.text && (
                    <span className="ex-option-text" lang={langOf(o.text)}>
                      {o.text}
                    </span>
                  )}
                  {o.pinyin && <span className="ex-pinyin">{o.pinyin}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(props.explanation || props.transcript) && (
        <div className="ex-review">
          {props.explanation && <p className="ex-explanation">{props.explanation}</p>}
          {props.transcript && (
            <details className="ex-transcript">
              <summary>Lời đoạn nghe</summary>
              <p lang={langOf(props.transcript)}>{props.transcript}</p>
            </details>
          )}
        </div>
      )}
    </article>
  );
}
