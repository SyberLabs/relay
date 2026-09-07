'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import type { DraftingPreference } from '../lib/drafting-decision';

export function BlockerReview({
  blocker,
  direction,
  preference,
  disabled,
  dirty,
  answer,
  onAnswer,
  onDecision,
}: {
  blocker: string;
  direction: string;
  preference: DraftingPreference;
  disabled: boolean;
  dirty: boolean;
  answer: string;
  onAnswer: (value: string) => void;
  onDecision: (
    choice: 'delegate' | 'answer' | 'reset',
    remember: boolean,
    answer: string,
  ) => Promise<boolean | undefined>;
}) {
  const [remember, setRemember] = useState(false);
  const [answering, setAnswering] = useState(false);
  const answerField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (answering) answerField.current?.focus();
  }, [answering]);
  const summary = blocker.trim().split(/(?<=[.!?])\s+|\n/)[0];
  const concise =
    summary.length > 180 ? summary.slice(0, 177).trimEnd() + '…' : summary;
  const pending = !!direction;
  return (
    <>
      {blocker && (
        <section
          className={`blocker-review${pending ? ' decision-shared' : ''}`}
          aria-labelledby="blocker-title"
        >
          <div className="decision-heading">
            <span className="decision-icon" aria-hidden="true">
              {pending ? <Check size={20} /> : <MessageCircle size={20} />}
            </span>
            <div>
              <span className="eyebrow">
                {pending ? 'Decision shared' : 'Your assistant needs direction'}
              </span>
              <h3 id="blocker-title">
                {pending
                  ? 'Ready for your assistant'
                  : 'Choose how to continue'}
              </h3>
            </div>
          </div>
          {pending ? (
            <p>
              Your direction is saved. Continue with your assistant to finish
              the draft.
            </p>
          ) : (
            <p className="decision-summary">{concise}</p>
          )}
          <details className="decision-context">
            <summary>
              {pending ? 'View question and direction' : 'Read full context'}
            </summary>
            <p>{blocker}</p>
            {pending && (
              <p>
                <strong>Your direction</strong>
                <br />
                {direction}
              </p>
            )}
          </details>
          {!pending && (
            <>
              <div className="decision-recommendation">
                <p>
                  Use your saved facts and leave out optional details. Ask only
                  if a required answer is missing.
                </p>
              </div>
              <div className="actions">
                <button
                  className="primary"
                  disabled={disabled || dirty || !!answer}
                  onClick={() => void onDecision('delegate', remember, '')}
                >
                  Use your judgment <ArrowRight size={16} />
                </button>
                <button
                  className="secondary"
                  disabled={disabled}
                  aria-expanded={answering}
                  onClick={() => setAnswering(!answering)}
                >
                  I’ll add context
                </button>
              </div>
              {!preference.routine && (
                <label className="decision-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    disabled={disabled}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Don’t ask me about routine writing choices again
                </label>
              )}
              {answering && (
                <form
                  className="decision-answer"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await onDecision('answer', false, answer)) {
                      setAnswering(false);
                    }
                  }}
                >
                  <label className="field">
                    Your answer or direction
                    <textarea
                      ref={answerField}
                      disabled={disabled}
                      value={answer}
                      onChange={(e) => onAnswer(e.target.value)}
                      maxLength={2000}
                      placeholder="A quick answer is enough."
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={disabled || dirty || !answer.trim()}
                  >
                    Share with assistant
                  </button>
                </form>
              )}
            </>
          )}
          {dirty && (
            <p className="muted">
              Save your current edits before sharing a decision.
            </p>
          )}
          {pending && (
            <p className="decision-footnote">
              The assistant still needs to resolve the question in the draft.
              Nothing has been accepted or sent.
            </p>
          )}
        </section>
      )}
      {preference.routine && (
        <div className="drafting-preference">
          <span>
            <Check size={16} aria-hidden="true" /> Routine writing choices are
            delegated
          </span>
          <button
            className="textbutton"
            disabled={disabled || dirty || !!answer}
            onClick={() => void onDecision('reset', false, '')}
          >
            Ask me again
          </button>
        </div>
      )}
    </>
  );
}
