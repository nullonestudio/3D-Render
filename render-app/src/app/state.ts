import { RenderSettings, DEFAULT_SETTINGS } from '../types/settings';

type Listener = (settings: RenderSettings) => void;

class AppState {
  private _settings: RenderSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  private _listeners: Set<Listener> = new Set();

  get settings(): RenderSettings {
    return this._settings;
  }

  update(updater: (s: RenderSettings) => void): void {
    updater(this._settings);
    this._notify();
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach(l => l(this._settings));
  }
}

export const appState = new AppState();
