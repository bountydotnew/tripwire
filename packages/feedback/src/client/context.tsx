import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { ReactGrabElementContext } from './types';
import type { FeedbackConfig, FeedbackContextType } from './types';

const FeedbackContext = createContext<FeedbackContextType | null>(null);

const EMPTY_CONFIG: FeedbackConfig = {};

export function FeedbackProvider({
  children,
  config = EMPTY_CONFIG,
  endpoint,
}: {
  children: ReactNode;
  config?: Omit<FeedbackConfig, 'endpoint'>;
  endpoint?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [elementContext, setElementContext] =
    useState<ReactGrabElementContext | null>(null);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);

  const mergedConfig: FeedbackConfig = useMemo(
    () => ({
      ...config,
      endpoint: endpoint ?? '/api/feedback',
    }),
    [config, endpoint]
  );

  const onOpenRef = useRef(mergedConfig.onOpen);
  const onCloseRef = useRef(mergedConfig.onClose);
  onOpenRef.current = mergedConfig.onOpen;
  onCloseRef.current = mergedConfig.onClose;

  const open = useCallback(() => {
    setIsOpen(true);
    setIsSelecting(false);
    onOpenRef.current?.();
  }, []);

  const close = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        return prev;
      }
      queueMicrotask(() => onCloseRef.current?.());
      return false;
    });
    setElementContext(null);
    setScreenshotBlob(null);
    setIsSelecting(false);
  }, []);

  const startSelection = useCallback(() => {
    setIsSelecting(true);
    setIsOpen(false);
  }, []);

  const cancelSelection = useCallback(() => {
    setIsSelecting(false);
  }, []);

  const selectElement = useCallback((context: ReactGrabElementContext, screenshot?: Blob | null) => {
    setElementContext(context);
    setScreenshotBlob(screenshot ?? null);
    setIsSelecting(false);
    setIsOpen(true);
    onOpenRef.current?.();
  }, []);

  const setScreenshot = useCallback((blob: Blob | null) => {
    setScreenshotBlob(blob);
  }, []);

  return (
    <FeedbackContext
      value={{
        isOpen,
        isSelecting,
        elementContext,
        screenshotBlob,
        open,
        close,
        startSelection,
        cancelSelection,
        selectElement,
        setScreenshot,
        config: mergedConfig,
      }}
    >
      {children}
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackContextType {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within <FeedbackProvider>');
  }
  return ctx;
}
