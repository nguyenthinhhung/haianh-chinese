import { createContext, useContext, useRef, useState } from "react";
import { BLANK } from "../core/exercise";
import type { AnswerValue, QuestionStatus, StudentItem, StudentOption, StudentPart, StudentQuestion } from "../core/exerciseGrade";
import { SKILL_LABELS } from "../core/exerciseSchema";
import "./player.css";

/**
 * The pieces an exercise is shown with, shared by the student's player and
 * the teacher's preview in the editor: a part's heading and one question.
 */

export type AssetUrl = (assetId: string) => string | undefined;

export const LETTERS = "ABCDEFGHIJ";

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

const STATUS_LABEL: Record<QuestionStatus, string> = {
  correct: "Đúng",
  partial: "Đúng một phần",
  wrong: "Sai",
  blank: "Chưa làm",
  pending: "Chờ giáo viên chấm",
};

const isRecord = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v);
const asRecord = (v: AnswerValue | undefined): Record<string, string> => (isRecord(v) ? v : {});
const asText = (v: AnswerValue | undefined) => (typeof v === "string" ? v : "");

/** A sentence with its `___` replaced by a highlighted slot. */
function Gapped({ text, fill, state }: { text: string; fill?: React.ReactNode; state?: string }) {
  const at = text.indexOf(BLANK);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className={`ex-gap${state ? ` ex-gap--${state}` : ""}`}>{fill || " "}</span>
      {text.slice(at + BLANK.length)}
    </>
  );
}

/** What every body gets: the question, the answer so far, and how to change it. */
interface BodyProps {
  q: StudentQuestion;
  number: number;
  assetUrl: AssetUrl;
  value?: AnswerValue;
  /** Present while the student can answer; `undefined` clears the answer. */
  answer?(value: AnswerValue | undefined): void;
  /** The right answer, after handing in or in the teacher's preview. */
  expected?: AnswerValue;
}

/**
 * Buttons stay clickable (not `disabled`) when read-only, so a click still
 * selects the card in the editor; while answering they keep the click to themselves.
 */
function onPick(props: BodyProps, value: AnswerValue | undefined) {
  return (e: React.MouseEvent) => {
    if (!props.answer) return;
    e.stopPropagation();
    props.answer(value);
  };
}

function optionsLayout(options: StudentOption[]): string {
  if (options.some((o) => o.image)) return "images";
  return options.every((o) => [...o.text].length <= 12 && [...o.pinyin].length <= 30) ? "grid" : "list";
}

function ChoiceBody(props: BodyProps) {
  const { q, number, assetUrl, value, expected } = props;
  const options = q.options ?? [];
  const state = (id: string) => (expected !== undefined ? (expected === id ? "right" : value === id ? "wrong" : "none") : value === id ? "chosen" : "none");
  return (
    <div className="ex-options" data-layout={optionsLayout(options)} role="radiogroup" aria-label={`Câu ${number}`}>
      {options.map((o, i) => {
        const src = o.image ? assetUrl(o.image) : undefined;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            tabIndex={props.answer ? 0 : -1}
            className={`ex-option ex-option--${state(o.id)}`}
            onClick={onPick(props, o.id)}
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
  );
}

function TrueFalseBody(props: BodyProps) {
  const { number, value, expected } = props;
  const state = (v: boolean) => (expected !== undefined ? (expected === v ? "right" : value === v ? "wrong" : "none") : value === v ? "chosen" : "none");
  return (
    <div className="ex-options" data-layout="tf" role="radiogroup" aria-label={`Câu ${number}`}>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          tabIndex={props.answer ? 0 : -1}
          className={`ex-option ex-option--${state(v)}`}
          onClick={onPick(props, v)}
        >
          <span className="ex-letter" aria-hidden="true">
            {v ? "✓" : "✗"}
          </span>
          <span className="ex-option-body">{v ? "Đúng" : "Sai"}</span>
        </button>
      ))}
    </div>
  );
}

function FillTextBody(props: BodyProps) {
  const { value, expected } = props;
  const text = asText(value);
  const accepted = Array.isArray(expected) ? expected : [];
  return (
    <div className="ex-fill">
      {props.answer ? (
        <input
          className="ex-input"
          value={text}
          lang={langOf(text)}
          maxLength={200}
          placeholder="Gõ câu trả lời"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => props.answer!(e.target.value.trim() ? e.target.value : undefined)}
        />
      ) : (
        text && (
          <p className="ex-given">
            Em trả lời: <strong lang={langOf(text)}>{text}</strong>
          </p>
        )
      )}
      {accepted.length > 0 && (
        <p className="ex-expected">
          Đáp án: <strong lang={langOf(accepted.join(""))}>{accepted.join(" / ")}</strong>
        </p>
      )}
    </div>
  );
}

const TONE_MARKS = ["ā", "á", "ǎ", "à", "a"];

function ToneBody(props: BodyProps) {
  const { q, number, value, expected } = props;
  const tones = q.withNeutral || expected === "5" ? ["1", "2", "3", "4", "5"] : ["1", "2", "3", "4"];
  const state = (t: string) => (expected !== undefined ? (expected === t ? "right" : value === t ? "wrong" : "none") : value === t ? "chosen" : "none");
  return (
    <div className="ex-options ex-tones" data-layout="grid" role="radiogroup" aria-label={`Câu ${number}`}>
      {tones.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          tabIndex={props.answer ? 0 : -1}
          className={`ex-option ex-option--${state(t)}`}
          onClick={onPick(props, t)}
        >
          <span className="ex-letter ex-tone-mark">{TONE_MARKS[Number(t) - 1]}</span>
          <span className="ex-option-body">{t === "5" ? "Thanh nhẹ" : `Thanh ${t}`}</span>
        </button>
      ))}
    </div>
  );
}

function OrderBody(props: BodyProps) {
  const { q, value, expected } = props;
  const chosen = Array.isArray(value) ? value : [];
  const right = Array.isArray(expected) ? expected : [];
  // The words still to place: every card, less one of each word already placed.
  const pool = [...(q.tokens ?? [])];
  for (const word of chosen) {
    const at = pool.indexOf(word);
    if (at >= 0) pool.splice(at, 1);
  }
  const set = (next: string[]) => props.answer?.(next.length ? next : undefined);
  return (
    <div className="ex-order">
      <div className={`ex-answer-line${chosen.length ? "" : " ex-answer-line--empty"}`} aria-label="Câu của em">
        {chosen.length
          ? chosen.map((word, i) => (
              <button
                key={`${word}-${i}`}
                type="button"
                className="ex-chip ex-chip--placed"
                lang={langOf(word)}
                tabIndex={props.answer ? 0 : -1}
                onClick={(e) => {
                  if (!props.answer) return;
                  e.stopPropagation();
                  // Back to the cards below.
                  set(chosen.filter((_, k) => k !== i));
                }}
              >
                {word}
              </button>
            ))
          : props.answer && <span className="ex-hint">Bấm các thẻ bên dưới theo đúng thứ tự</span>}
      </div>
      {props.answer && (
        <div className="ex-chips">
          {pool.map((word, i) => (
            <button key={`${word}-${i}`} type="button" className="ex-chip" lang={langOf(word)} onClick={(e) => (e.stopPropagation(), set([...chosen, word]))}>
              {word}
            </button>
          ))}
        </div>
      )}
      {right.length > 0 && (
        <p className="ex-expected">
          Câu đúng: <strong lang="zh-CN">{right.join(" ")}</strong>
        </p>
      )}
    </div>
  );
}

function ItemContent({ item, assetUrl }: { item: StudentItem; assetUrl: AssetUrl }) {
  const src = item.image ? assetUrl(item.image) : undefined;
  return (
    <>
      {src && <img className="ex-item-image" src={src} alt="" />}
      {item.text && <span lang={langOf(item.text)}>{item.text}</span>}
    </>
  );
}

/** Rows that each take one of a set of choices (matching, word box, sorting): one point per row. */
function ChoiceRows(
  props: BodyProps & { rows: StudentItem[]; choices: StudentItem[]; label(choice: StudentItem, index: number): string; renderRow?(row: StudentItem, chosen?: StudentItem, right?: StudentItem): React.ReactNode },
) {
  const { rows, choices, value, expected, assetUrl } = props;
  const given = asRecord(value);
  const right = isRecord(expected) ? expected : undefined;
  const pick = (row: string, choice: string) => (e: React.MouseEvent) => {
    if (!props.answer) return;
    e.stopPropagation();
    const next = { ...given };
    if (next[row] === choice) delete next[row];
    else next[row] = choice;
    props.answer(Object.keys(next).length ? next : undefined);
  };
  return (
    <ol className="ex-rows">
      {rows.map((row, r) => {
        const chosenId = given[row.id];
        const rightId = right?.[row.id];
        const rowState = right ? (chosenId === rightId ? "right" : chosenId ? "wrong" : "none") : "none";
        return (
          <li key={row.id} className={`ex-row ex-row--${rowState}`}>
            <div className="ex-row-item">
              {props.renderRow ? (
                props.renderRow(row, choices.find((c) => c.id === chosenId), choices.find((c) => c.id === rightId))
              ) : (
                <>
                  <span className="ex-row-number">{r + 1}</span>
                  <ItemContent item={row} assetUrl={assetUrl} />
                </>
              )}
            </div>
            <div className="ex-row-choices" role="radiogroup" aria-label={`Mục ${r + 1}`}>
              {choices.map((c, i) => {
                const state = right ? (c.id === rightId ? "right" : c.id === chosenId ? "wrong" : "none") : c.id === chosenId ? "chosen" : "none";
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === chosenId}
                    tabIndex={props.answer ? 0 : -1}
                    className={`ex-pick ex-pick--${state}`}
                    onClick={pick(row.id, c.id)}
                  >
                    {props.label(c, i)}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MatchingBody(props: BodyProps) {
  const { q, assetUrl } = props;
  const rights = q.rights ?? [];
  return (
    <div className="ex-matching">
      <ol className="ex-choices-list">
        {rights.map((r, i) => (
          <li key={r.id}>
            <span className="ex-letter">{LETTERS[i]}</span>
            <ItemContent item={r} assetUrl={assetUrl} />
          </li>
        ))}
      </ol>
      <ChoiceRows {...props} rows={q.lefts ?? []} choices={rights} label={(_, i) => LETTERS[i]!} />
    </div>
  );
}

function WordBankBody(props: BodyProps) {
  const { q } = props;
  const bank = q.bank ?? [];
  return (
    <div className="ex-wordbank">
      <ol className="ex-bank">
        {bank.map((b, i) => (
          <li key={b.id}>
            <span className="ex-letter">{LETTERS[i]}</span>
            <span lang={langOf(b.text)}>{b.text}</span>
          </li>
        ))}
      </ol>
      <ChoiceRows
        {...props}
        rows={q.gaps ?? []}
        choices={bank}
        label={(_, i) => LETTERS[i]!}
        renderRow={(row, chosen, right) => {
          // After handing in: the right word in the gap, and a wrong pick struck out before it.
          const wrong = right && chosen && chosen.id !== right.id;
          const fill = right ? (
            <>
              {wrong && <s className="ex-struck">{chosen.text}</s>}
              {right.text}
            </>
          ) : (
            chosen?.text
          );
          return (
            <span className="ex-gap-sentence" lang="zh-CN">
              <Gapped text={row.text} fill={fill} state={right ? "right" : undefined} />
            </span>
          );
        }}
      />
    </div>
  );
}

function SortBody(props: BodyProps) {
  const { q } = props;
  return <ChoiceRows {...props} rows={q.cards ?? []} choices={q.groups ?? []} label={(g) => g.text} />;
}

function WritingBody(props: BodyProps) {
  const { q, value, expected } = props;
  const text = asText(value);
  const max = q.maxChars ?? 200;
  const sample = typeof expected === "string" ? expected : "";
  return (
    <div className="ex-writing">
      {props.answer ? (
        <>
          <textarea
            className="ex-textarea"
            value={text}
            maxLength={max}
            rows={4}
            lang={langOf(text)}
            placeholder="Viết câu trả lời của em"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => props.answer!(e.target.value.trim() ? e.target.value : undefined)}
          />
          <span className="ex-counter">
            {[...text].length}/{max}
          </span>
        </>
      ) : (
        text && (
          <p className="ex-given ex-given--block" lang={langOf(text)}>
            {text}
          </p>
        )
      )}
      {sample && (
        <p className="ex-expected">
          Bài mẫu: <span lang={langOf(sample)}>{sample}</span>
        </p>
      )}
    </div>
  );
}

const BODIES: Record<StudentQuestion["type"], (props: BodyProps) => React.ReactNode> = {
  choice: ChoiceBody,
  "blank-choice": ChoiceBody,
  "true-false": TrueFalseBody,
  "fill-text": FillTextBody,
  "tone-pick": ToneBody,
  "sentence-order": OrderBody,
  matching: MatchingBody,
  "word-bank": WordBankBody,
  "sort-groups": SortBody,
  writing: WritingBody,
};

/** The question itself; a gap in it shows the word chosen or typed for it. */
function Prompt({ q, value, expected }: { q: StudentQuestion; value?: AnswerValue; expected?: AnswerValue }) {
  if (!q.prompt) return null;
  if ((q.type === "blank-choice" || q.type === "fill-text") && q.prompt.includes(BLANK)) {
    let fill: string | undefined;
    let state: string | undefined;
    if (q.type === "blank-choice") {
      const right = q.options?.find((o) => o.id === expected);
      // After handing in (and in the preview) the gap shows the right word; a wrong pick shows in the options.
      fill = right ? right.text : q.options?.find((o) => o.id === value)?.text;
      state = right ? "right" : undefined;
    } else {
      fill = asText(value);
    }
    return (
      <p className="ex-prompt" lang="zh-CN">
        <Gapped text={q.prompt} fill={fill} state={state} />
      </p>
    );
  }
  return (
    <p className="ex-prompt" lang={langOf(q.prompt)}>
      {q.prompt}
    </p>
  );
}

export interface QuestionCardProps {
  question: StudentQuestion;
  number: number;
  assetUrl: AssetUrl;
  /** What the student answered. */
  value?: AnswerValue;
  /** Present while the student can answer; `undefined` clears the answer. */
  onAnswer?(value: AnswerValue | undefined): void;
  /** The right answer, marked after handing in (and in the teacher's preview). */
  expected?: AnswerValue;
  status?: QuestionStatus;
  /** Points earned, shown with the status after handing in. */
  earned?: number;
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
  const { question: q, number, assetUrl, value, expected, status } = props;
  const image = q.image ? assetUrl(q.image) : undefined;
  const Body = BODIES[q.type];
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
        {q.points > 1 && <span className="ex-q-points">{status && props.earned !== undefined ? `${props.earned}/${q.points}` : q.points} điểm</span>}
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
      <Prompt q={q} value={value} expected={expected} />
      {q.pinyin && <p className="ex-pinyin">{q.pinyin}</p>}
      {image && <img className="ex-q-image" src={image} alt="" />}
      {q.audio && <AudioClip assetId={q.audio} assetUrl={assetUrl} label="Nghe câu này" />}
      <Body q={q} number={number} assetUrl={assetUrl} value={value} expected={expected} {...(props.onAnswer ? { answer: props.onAnswer } : {})} />

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
