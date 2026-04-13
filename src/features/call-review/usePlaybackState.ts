import * as React from "react";

export interface PlaybackControls {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isPlaying: boolean;
  volume: number;
  seek: (seconds: number) => void;
  seekRelative: (deltaSeconds: number) => void;
  togglePlay: () => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (v: number) => void;
}

export function usePlaybackState(fallbackDurationSeconds: number): PlaybackControls {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(fallbackDurationSeconds);
  const [playbackRate, setPlaybackRateState] = React.useState(1);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [volume, setVolumeState] = React.useState(1);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTime = () => {
      setCurrentTime(audio.currentTime);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onRate = () => setPlaybackRateState(audio.playbackRate);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("seeked", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ratechange", onRate);

    setVolumeState(audio.volume);
    setPlaybackRateState(audio.playbackRate);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("seeked", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ratechange", onRate);
    };
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const seek = React.useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    const next = Math.min(Math.max(0, seconds), max > 0 ? max : seconds);
    audio.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const seekRelative = React.useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      const base = audio ? audio.currentTime : currentTime;
      seek(base + deltaSeconds);
    },
    [currentTime, seek]
  );

  const togglePlay = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const setPlaybackRate = React.useCallback((rate: number) => {
    const audio = audioRef.current;
    const clamped = Math.min(2, Math.max(0.5, rate));
    if (audio) {
      audio.playbackRate = clamped;
    }
    setPlaybackRateState(clamped);
  }, []);

  const setVolume = React.useCallback((v: number) => {
    const audio = audioRef.current;
    const clamped = Math.min(1, Math.max(0, v));
    if (audio) {
      audio.volume = clamped;
    }
    setVolumeState(clamped);
  }, []);

  return {
    audioRef,
    currentTime,
    duration,
    playbackRate,
    isPlaying,
    volume,
    seek,
    seekRelative,
    togglePlay,
    setPlaybackRate,
    setVolume,
  };
}
