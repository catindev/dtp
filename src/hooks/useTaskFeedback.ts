import { useEffect, useRef, useState } from "react";
import type { RtColumn } from "../realtime/simulation";

export function useTaskFeedback() {
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  const [bounceTaskIds, setBounceTaskIds] = useState<Set<string>>(() => new Set());
  const [shakeTaskIds, setShakeTaskIds] = useState<Set<string>>(() => new Set());
  const [shakeColumnIds, setShakeColumnIds] = useState<Set<RtColumn>>(() => new Set());
  const [pauseShake, setPauseShake] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const bounceTimers = useRef<Record<string, number>>({});
  const shakeTaskTimers = useRef<Record<string, number>>({});
  const shakeColumnTimers = useRef<Partial<Record<RtColumn, number>>>({});
  const pauseShakeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      resetFeedback();
    },
    [],
  );

  function flashTask(taskId: string) {
    setFlashTaskId(taskId);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashTaskId(null), 420);
  }

  function bounceTask(taskId: string) {
    setBounceTaskIds((current) => new Set(current).add(taskId));
    if (bounceTimers.current[taskId]) {
      window.clearTimeout(bounceTimers.current[taskId]);
    }
    bounceTimers.current[taskId] = window.setTimeout(() => {
      setBounceTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      delete bounceTimers.current[taskId];
    }, 720);
  }

  function shakeTask(taskId: string) {
    setShakeTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
    if (shakeTaskTimers.current[taskId]) {
      window.clearTimeout(shakeTaskTimers.current[taskId]);
    }
    window.requestAnimationFrame(() => {
      setShakeTaskIds((current) => new Set(current).add(taskId));
      shakeTaskTimers.current[taskId] = window.setTimeout(() => {
        setShakeTaskIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
        delete shakeTaskTimers.current[taskId];
      }, 420);
    });
  }

  function shakeColumn(column: RtColumn) {
    setShakeColumnIds((current) => {
      const next = new Set(current);
      next.delete(column);
      return next;
    });
    if (shakeColumnTimers.current[column]) {
      window.clearTimeout(shakeColumnTimers.current[column]);
    }
    window.requestAnimationFrame(() => {
      setShakeColumnIds((current) => new Set(current).add(column));
      shakeColumnTimers.current[column] = window.setTimeout(() => {
        setShakeColumnIds((current) => {
          const next = new Set(current);
          next.delete(column);
          return next;
        });
        delete shakeColumnTimers.current[column];
      }, 420);
    });
  }

  function shakePauseButton() {
    setPauseShake(false);
    if (pauseShakeTimer.current) {
      window.clearTimeout(pauseShakeTimer.current);
    }
    window.requestAnimationFrame(() => {
      setPauseShake(true);
      pauseShakeTimer.current = window.setTimeout(() => {
        setPauseShake(false);
        pauseShakeTimer.current = null;
      }, 420);
    });
  }

  function resetFeedback() {
    if (flashTimer.current) {
      window.clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
    for (const timer of Object.values(bounceTimers.current)) {
      window.clearTimeout(timer);
    }
    for (const timer of Object.values(shakeTaskTimers.current)) {
      window.clearTimeout(timer);
    }
    for (const timer of Object.values(shakeColumnTimers.current)) {
      if (timer) window.clearTimeout(timer);
    }
    if (pauseShakeTimer.current) {
      window.clearTimeout(pauseShakeTimer.current);
      pauseShakeTimer.current = null;
    }
    bounceTimers.current = {};
    shakeTaskTimers.current = {};
    shakeColumnTimers.current = {};
    setFlashTaskId(null);
    setBounceTaskIds(new Set());
    setShakeTaskIds(new Set());
    setShakeColumnIds(new Set());
    setPauseShake(false);
  }

  return {
    flashTaskId,
    bounceTaskIds,
    shakeTaskIds,
    shakeColumnIds,
    pauseShake,
    flashTask,
    bounceTask,
    shakeTask,
    shakeColumn,
    shakePauseButton,
    resetFeedback,
  };
}
