export class LoadingOverlay {
  private _el: HTMLElement;
  private _bar: HTMLElement;
  private _status: HTMLElement;
  private _cancelBtn: HTMLButtonElement | null = null;
  private _onCancel?: () => void;

  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'loading-overlay';
    this._el.innerHTML = `
      <div class="loading-box">
        <div class="loading-title">Loading</div>
        <div class="loading-bar-wrap"><div class="loading-bar-fill" style="width:0%"></div></div>
        <div class="loading-status">Starting...</div>
        <button class="cancel-btn" style="display:none">Cancel</button>
      </div>
    `;
    document.body.appendChild(this._el);
    this._bar = this._el.querySelector('.loading-bar-fill')!;
    this._status = this._el.querySelector('.loading-status')!;
    this._cancelBtn = this._el.querySelector('.cancel-btn');
    this._cancelBtn?.addEventListener('click', () => this._onCancel?.());
    this.hide();
  }

  show(title = 'Loading', showCancel = false, onCancel?: () => void): void {
    this._el.querySelector('.loading-title')!.textContent = title;
    this._el.style.display = 'flex';
    this._onCancel = onCancel;
    if (this._cancelBtn) {
      this._cancelBtn.style.display = showCancel ? 'block' : 'none';
    }
    this.update(0, 'Starting...');
  }

  update(pct: number, status: string): void {
    this._bar.style.width = `${Math.round(pct * 100)}%`;
    this._status.textContent = status;
  }

  hide(): void {
    this._el.style.display = 'none';
  }
}
