export class Toolbar {
  private _el: HTMLElement;
  private _onImport?: (file: File) => void;
  private _onRender?: () => void;
  private _onModeChange?: (mode: 'translate' | 'rotate' | 'scale') => void;
  private _onFrame?: () => void;
  private _fileInput: HTMLInputElement;
  private _modeButtons: { mode: string; btn: HTMLButtonElement }[] = [];
  private _renderBtn: HTMLButtonElement;
  private _spaceToggle: HTMLButtonElement;
  private _currentSpace: 'local' | 'world' = 'world';
  private _onSpaceToggle?: (space: 'local' | 'world') => void;

  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'toolbar';
    this._el.innerHTML = `
      <button id="btn-import" title="Import FBX">📂 Import FBX</button>
      <span class="sep"></span>
      <button class="gizmo-btn" data-mode="translate" title="Translate (W)">↔ Translate</button>
      <button class="gizmo-btn" data-mode="rotate" title="Rotate (E)">↻ Rotate</button>
      <button class="gizmo-btn" data-mode="scale" title="Scale (R)">⇔ Scale</button>
      <button id="btn-space" title="Toggle Space (Q)">World</button>
      <span class="sep"></span>
      <button id="btn-frame" title="Frame Model (F)">⊡ Frame</button>
      <span class="flex-spacer"></span>
      <button id="btn-render" class="render-btn" title="Render">▶ Render</button>
      <input type="file" id="file-input" accept=".fbx" style="display:none">
    `;
    document.body.prepend(this._el);

    this._fileInput = this._el.querySelector('#file-input')!;
    this._renderBtn = this._el.querySelector('#btn-render')!;
    this._spaceToggle = this._el.querySelector('#btn-space')!;

    this._el.querySelector('#btn-import')!.addEventListener('click', () => {
      this._fileInput.click();
    });

    this._fileInput.addEventListener('change', () => {
      const file = this._fileInput.files?.[0];
      if (file) this._onImport?.(file);
      this._fileInput.value = '';
    });

    this._el.querySelector('#btn-frame')!.addEventListener('click', () => {
      this._onFrame?.();
    });

    this._el.querySelectorAll('.gizmo-btn').forEach(btn => {
      const b = btn as HTMLButtonElement;
      this._modeButtons.push({ mode: b.dataset.mode!, btn: b });
      b.addEventListener('click', () => {
        const mode = b.dataset.mode as 'translate' | 'rotate' | 'scale';
        this.setActiveMode(mode);
        this._onModeChange?.(mode);
      });
    });

    this._spaceToggle.addEventListener('click', () => {
      this._currentSpace = this._currentSpace === 'world' ? 'local' : 'world';
      this._spaceToggle.textContent = this._currentSpace === 'world' ? 'World' : 'Local';
      this._onSpaceToggle?.(this._currentSpace);
    });

    this._renderBtn.addEventListener('click', () => this._onRender?.());
    this.setActiveMode('translate');
  }

  setActiveMode(mode: string): void {
    this._modeButtons.forEach(({ mode: m, btn }) => {
      btn.classList.toggle('active', m === mode);
    });
  }

  setRenderState(rendering: boolean): void {
    this._renderBtn.textContent = rendering ? '⏹ Cancel' : '▶ Render';
    this._renderBtn.classList.toggle('rendering', rendering);
  }

  onImport(fn: (file: File) => void): void { this._onImport = fn; }
  onRender(fn: () => void): void { this._onRender = fn; }
  onModeChange(fn: (mode: 'translate' | 'rotate' | 'scale') => void): void { this._onModeChange = fn; }
  onFrame(fn: () => void): void { this._onFrame = fn; }
  onSpaceToggle(fn: (space: 'local' | 'world') => void): void { this._onSpaceToggle = fn; }

  get element(): HTMLElement { return this._el; }
}
