import { useState, useRef, useCallback, type FormEvent } from 'react';
import { useFeedback } from './context';

export function FeedbackForm({ onSuccess }: { onSuccess?: () => void }) {
  const { isOpen, close, elementContext, screenshotBlob: preCapture, config } = useFeedback();
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [prompt, setPrompt] = useState('');
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const ui = {
    placeholder: config.ui?.placeholder ?? 'What happened? What did you expect?',
    submitLabel: config.ui?.submitLabel ?? 'Send Feedback',
    cancelLabel: config.ui?.cancelLabel ?? 'Cancel',
  };

  const prevIsOpen = useRef(isOpen);
  if (isOpen && !prevIsOpen.current) {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    });
  }
  prevIsOpen.current = isOpen;

  const handleClose = useCallback(() => {
    if (status === 'sending') {
      return;
    }
    setStatus('idle');
    setErrorMessage(null);
    setComment('');
    setPrompt('');
    setIncludeScreenshot(true);
    close();
  }, [status, close]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!comment.trim()) {
        return;
      }
      setStatus('sending');

      try {
        const screenshotBlob = includeScreenshot ? preCapture : null;
        const route = window.location.pathname;

        const formData = new FormData();
        formData.append('comment', comment.trim());
        formData.append('route', route);
        formData.append('userAgent', navigator.userAgent);

        if (prompt.trim()) {
          formData.append('prompt', prompt.trim());
        }

        if (config.metadata) {
          formData.append('metadata', JSON.stringify(config.metadata));
        }

        if (elementContext) {
          formData.append(
            'element',
            JSON.stringify({
              componentName: elementContext.componentName,
              selector: elementContext.selector,
              htmlPreview: elementContext.htmlPreview,
              stack: elementContext.stack.map(
                (frame: {
                  functionName?: string;
                  fileName?: string;
                  lineNumber?: number;
                  columnNumber?: number;
                }) => ({
                  functionName: frame.functionName,
                  fileName: frame.fileName,
                  lineNumber: frame.lineNumber,
                  columnNumber: frame.columnNumber,
                })
              ),
            })
          );
        }

        if (screenshotBlob) {
          formData.append('screenshot', screenshotBlob, 'screenshot.png');
        }

        const res = await fetch(config.endpoint ?? '/api/feedback', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          throw new Error(res.statusText || 'Failed to submit feedback');
        }

        config.onSubmit?.({
          comment: comment.trim(),
          route,
          componentName: elementContext?.componentName ?? undefined,
          selector: elementContext?.selector ?? undefined,
          metadata: config.metadata,
          screenshot: !!screenshotBlob,
        });

        setStatus('success');
        setErrorMessage(null);
        setTimeout(() => {
          onSuccess?.();
          handleClose();
        }, 1500);
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.'
        );
      }
    },
    [
      comment,
      prompt,
      includeScreenshot,
      preCapture,
      config,
      elementContext,
      handleClose,
      onSuccess,
    ]
  );

  const sourceFrame = elementContext?.stack[0] ?? null;
  const sourceLabel = sourceFrame?.fileName
    ? `${sourceFrame.fileName.split('/').pop()}${sourceFrame.lineNumber ? `:${sourceFrame.lineNumber}` : ''}`
    : null;

  if (status === 'success') {
    return (
      <div
        className="flex flex-col items-center gap-2 py-8 text-center"
        data-feedback-success
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tw-success/10">
          <svg
            className="h-5 w-5 text-tw-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-tw-text-primary">Feedback sent</p>
        <p className="text-xs text-tw-text-muted">
          Thanks for helping us improve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-feedback-form className="space-y-3">
      {/* Element context pill */}
      {elementContext && (
        <div className="flex items-center gap-2 rounded-md bg-tw-inner px-2.5 py-2 text-xs">
          <svg
            className="w-3.5 h-3.5 text-tw-accent shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          <span className="font-medium text-tw-text-primary truncate">
            {elementContext.componentName || 'Unknown'}
          </span>
          {elementContext.selector && (
            <code className="text-tw-text-tertiary font-mono truncate max-w-[160px]">
              {elementContext.selector}
            </code>
          )}
          {sourceLabel && (
            <>
              <span className="text-tw-text-tertiary">&#183;</span>
              <span className="text-tw-text-tertiary font-mono truncate">
                {sourceLabel}
              </span>
            </>
          )}
        </div>
      )}

      {/* Comment */}
      <textarea
        ref={textareaRef}
        id="fb-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={ui.placeholder}
        required
        disabled={status === 'sending'}
        rows={3}
        className="w-full resize-none rounded-lg border border-tw-border bg-tw-bg px-3 py-2.5 text-sm text-tw-text-primary placeholder:text-tw-text-tertiary focus:border-tw-accent focus:outline-none disabled:opacity-50 transition-colors"
      />

      {/* Suggested fix */}
      <textarea
        id="fb-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Suggested fix (optional)"
        disabled={status === 'sending'}
        rows={2}
        className="w-full resize-none rounded-lg border border-tw-border bg-tw-bg px-3 py-2.5 text-sm text-tw-text-primary placeholder:text-tw-text-tertiary focus:border-tw-accent focus:outline-none disabled:opacity-50 transition-colors"
      />

      {/* Screenshot toggle + actions */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex cursor-pointer items-center gap-2 select-none group">
          <button
            type="button"
            role="switch"
            aria-checked={includeScreenshot}
            onClick={() => setIncludeScreenshot(!includeScreenshot)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              includeScreenshot ? 'bg-tw-accent' : 'bg-tw-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                includeScreenshot ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
          <span className="text-xs text-tw-text-muted group-hover:text-tw-text-secondary transition-colors">
            {preCapture ? 'Screenshot' : 'Screenshot (capturing...)'}
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={status === 'sending'}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-tw-text-muted transition-colors hover:text-tw-text-secondary hover:bg-tw-inner disabled:opacity-50"
          >
            {ui.cancelLabel}
          </button>
          <button
            type="submit"
            disabled={status === 'sending' || !comment.trim()}
            onClick={() => status === 'error' && setErrorMessage(null)}
            className="flex items-center gap-1.5 rounded-lg bg-tw-accent px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-tw-accent/85 disabled:opacity-40"
          >
            {status === 'sending' && (
              <svg
                className="h-3 w-3 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {status === 'sending' ? 'Sending...' : ui.submitLabel}
          </button>
        </div>
      </div>

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-xs text-tw-error">{errorMessage}</p>
      )}
    </form>
  );
}
