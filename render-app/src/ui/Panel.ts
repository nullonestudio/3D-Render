import { appState } from '../app/state';
import { CameraManager } from '../core/CameraManager';

function fovToMM(fov: number): number {
  // 36mm sensor, full frame equivalent focal length
  return Math.round(18 / Math.tan((fov * Math.PI) / 360));
}

export class Panel {
  private _el: HTMLElement;
  private _cameraManager?: CameraManager;

  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'properties-panel';
    this._el.innerHTML = this._buildHTML();
    document.body.appendChild(this._el);
    this._bindAll();
  }

  setCameraManager(mgr: CameraManager): void {
    this._cameraManager = mgr;
  }

  private _buildHTML(): string {
    const s = appState.settings;
    return `
<div class="panel-header">Properties</div>
<div class="panel-body">
  <!-- Light -->
  <details open><summary>💡 Light</summary>
    <label>Type<select id="p-light-type">
      <option value="directional" ${s.light.type === 'directional' ? 'selected' : ''}>Directional</option>
      <option value="point" ${s.light.type === 'point' ? 'selected' : ''}>Point</option>
      <option value="spot" ${s.light.type === 'spot' ? 'selected' : ''}>Spot</option>
    </select></label>
    <label>Color<input type="color" id="p-light-color" value="${s.light.color}"></label>
    <label>Intensity<input type="range" id="p-light-intensity" min="0" max="5" step="0.1" value="${s.light.intensity}"><span id="v-light-intensity">${s.light.intensity.toFixed(1)}</span></label>
    <label>Azimuth<input type="range" id="p-light-azimuth" min="0" max="360" step="1" value="${s.light.azimuth}"><span id="v-light-azimuth">${s.light.azimuth}°</span></label>
    <label>Elevation<input type="range" id="p-light-elevation" min="5" max="90" step="1" value="${s.light.elevation}"><span id="v-light-elevation">${s.light.elevation}°</span></label>
    <label>Softness<input type="range" id="p-light-softness" min="1" max="8" step="0.2" value="${s.light.shadowSoftness}"><span id="v-light-softness">${s.light.shadowSoftness.toFixed(1)}</span></label>
    <label class="checkbox-label"><input type="checkbox" id="p-ground-visible" ${s.light.groundVisible !== false ? 'checked' : ''}> Ground Shadow Catcher</label>
  </details>

  <!-- Environment -->
  <details open><summary>🌐 Environment</summary>
    <label>HDRI<input type="file" id="p-env-hdri" accept=".hdr,.exr"></label>
    <label>Intensity<input type="range" id="p-env-intensity" min="0" max="3" step="0.05" value="${s.environment.intensity}"><span id="v-env-intensity">${s.environment.intensity.toFixed(2)}</span></label>
    <label>Rotation<input type="range" id="p-env-rotation" min="0" max="360" step="1" value="${s.environment.rotation}"><span id="v-env-rotation">${s.environment.rotation}°</span></label>
    <label class="checkbox-label" title="Toggles visible 360 skybox in viewport"><input type="checkbox" id="p-env-bg" ${s.environment.showBackground ? 'checked' : ''}> Show Skybox (Viewport)</label>
  </details>

  <!-- Surface / Material Finish -->
  <details open><summary>✨ Surface & Sheen</summary>
    <label>Roughness<input type="range" id="p-mat-roughness" min="0.05" max="1.0" step="0.05" value="${s.material.roughness}"><span id="v-mat-roughness">${s.material.roughness.toFixed(2)}</span></label>
    <label>Metalness<input type="range" id="p-mat-metalness" min="0.0" max="1.0" step="0.05" value="${s.material.metalness}"><span id="v-mat-metalness">${s.material.metalness.toFixed(2)}</span></label>
  </details>

  <!-- Quality -->
  <details open><summary>⚙️ Quality & Framing</summary>
    <label>Atlas Quality<select id="p-atlas-quality">
      <option value="low" ${s.quality.atlasQuality === 'low' ? 'selected' : ''}>Low</option>
      <option value="medium" ${s.quality.atlasQuality === 'medium' ? 'selected' : ''}>Medium</option>
      <option value="high" ${s.quality.atlasQuality === 'high' ? 'selected' : ''}>High</option>
      <option value="ultra" ${s.quality.atlasQuality === 'ultra' ? 'selected' : ''}>Ultra</option>
    </select></label>
    <label>AA Samples<select id="p-pixel-quality">
      <option value="1" ${s.quality.pixelQuality === 1 ? 'selected' : ''}>1 (Off)</option>
      <option value="4" ${s.quality.pixelQuality === 4 ? 'selected' : ''}>4 (Soft Area Light)</option>
      <option value="16" ${s.quality.pixelQuality === 16 ? 'selected' : ''}>16 (High Quality)</option>
      <option value="64" ${s.quality.pixelQuality === 64 ? 'selected' : ''}>64 (Ultra Soft)</option>
    </select></label>
    <label>Resolution<select id="p-resolution">
      <option value="1k" ${s.quality.resolution === '1k' ? 'selected' : ''}>1K</option>
      <option value="2k" ${s.quality.resolution === '2k' ? 'selected' : ''}>2K</option>
      <option value="4k" ${s.quality.resolution === '4k' ? 'selected' : ''}>4K</option>
      <option value="8k" ${s.quality.resolution === '8k' ? 'selected' : ''}>8K</option>
      <option value="custom" ${s.quality.resolution === 'custom' ? 'selected' : ''}>Custom</option>
    </select></label>
    <label>Aspect Ratio<select id="p-aspect">
      <option value="16:9" ${s.quality.aspectRatio === '16:9' ? 'selected' : ''}>16:9 (Wide / Recommended)</option>
      <option value="3:2" ${s.quality.aspectRatio === '3:2' ? 'selected' : ''}>3:2 (Photo)</option>
      <option value="4:3" ${s.quality.aspectRatio === '4:3' ? 'selected' : ''}>4:3 (Standard)</option>
      <option value="1:1" ${s.quality.aspectRatio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
      <option value="custom" ${s.quality.aspectRatio === 'custom' ? 'selected' : ''}>Custom</option>
    </select></label>
    <div id="custom-res-row" style="display:${s.quality.resolution === 'custom' ? 'block' : 'none'}">
      <label>Width<input type="number" id="p-custom-w" value="${s.quality.customWidth}" min="64" max="16384"></label>
      <label>Height<input type="number" id="p-custom-h" value="${s.quality.customHeight}" min="64" max="16384"></label>
    </div>
    <label class="checkbox-label" title="Render PNG with transparent alpha background"><input type="checkbox" id="p-transparent-bg" ${s.quality.transparentBackground ? 'checked' : ''}> Transparent PNG Output</label>
    <label class="checkbox-label" title="Darkens contacts and recesses"><input type="checkbox" id="p-quality-ao" ${s.quality.ambientOcclusion !== false ? 'checked' : ''}> Contact Shadows & AO</label>
  </details>

  <!-- Camera -->
  <details open><summary>📷 Camera</summary>
    <label>Mode<select id="p-cam-mode">
      <option value="perspective" ${s.camera.mode === 'perspective' ? 'selected' : ''}>Perspective</option>
      <option value="orthographic" ${s.camera.mode === 'orthographic' ? 'selected' : ''}>Orthographic</option>
    </select></label>
    <label>FOV<input type="range" id="p-cam-fov" min="10" max="120" step="1" value="${s.camera.fov}"><span id="v-cam-fov">${s.camera.fov}° / ${fovToMM(s.camera.fov)}mm</span></label>
    <label>Exposure<input type="range" id="p-cam-exposure" min="0.1" max="5" step="0.05" value="${s.camera.exposure}"><span id="v-cam-exposure">${s.camera.exposure.toFixed(2)}</span></label>
    <label>Tone Map<select id="p-tonemap">
      <option value="ACES" ${s.camera.toneMapping === 'ACES' ? 'selected' : ''}>ACES</option>
      <option value="AgX" ${s.camera.toneMapping === 'AgX' ? 'selected' : ''}>AgX</option>
      <option value="Neutral" ${s.camera.toneMapping === 'Neutral' ? 'selected' : ''}>Neutral</option>
      <option value="None" ${s.camera.toneMapping === 'None' ? 'selected' : ''}>None</option>
    </select></label>
    <div class="bookmarks-section">
      <div class="bookmarks-title">Bookmarks</div>
      <div style="display:flex;gap:4px">
        <input type="text" id="p-bookmark-name" placeholder="Name..." style="flex:1;min-width:0">
        <button id="p-bookmark-save">Save</button>
      </div>
      <div id="bookmark-list"></div>
      <button id="p-cam-reset" style="margin-top:6px;width:100%">Reset Camera</button>
      <button id="p-cam-frame" style="margin-top:4px;width:100%">Fit Model to Frame</button>
    </div>
  </details>
</div>`;
  }

  private _bind(selector: string, event: string, fn: (value: string) => void): void {
    const el = this._el.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
    el?.addEventListener(event, () => fn(el.value));
  }

  private _bindRange(
    selector: string,
    displaySelector: string,
    fn: (value: number) => string
  ): void {
    const el = this._el.querySelector(selector) as HTMLInputElement | null;
    const display = this._el.querySelector(displaySelector) as HTMLElement | null;
    el?.addEventListener('input', () => {
      const val = parseFloat(el.value);
      const text = fn(val);
      if (display) display.textContent = text;
    });
  }

  private _bindAll(): void {
    this._bind('#p-light-type', 'change', (v) => appState.update(s => { s.light.type = v as any; }));
    this._bind('#p-light-color', 'input', (v) => appState.update(s => { s.light.color = v; }));
    this._bindRange('#p-light-intensity', '#v-light-intensity', (v) => {
      appState.update(s => { s.light.intensity = v; });
      return v.toFixed(1);
    });
    this._bindRange('#p-light-azimuth', '#v-light-azimuth', (v) => {
      appState.update(s => { s.light.azimuth = v; });
      return `${v}°`;
    });
    this._bindRange('#p-light-elevation', '#v-light-elevation', (v) => {
      appState.update(s => { s.light.elevation = v; });
      return `${v}°`;
    });
    this._bindRange('#p-light-softness', '#v-light-softness', (v) => {
      appState.update(s => { s.light.shadowSoftness = v; });
      return v.toFixed(1);
    });
    this._el.querySelector('#p-ground-visible')?.addEventListener('change', (e) => {
      appState.update(s => { s.light.groundVisible = (e.target as HTMLInputElement).checked; });
    });

    // Environment HDRI file
    this._el.querySelector('#p-env-hdri')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        appState.update(s => { s.environment.hdri = url; });
        window.dispatchEvent(new CustomEvent('hdri-changed', { detail: { url } }));
      }
    });

    this._bindRange('#p-env-intensity', '#v-env-intensity', (v) => {
      appState.update(s => { s.environment.intensity = v; });
      return v.toFixed(2);
    });
    this._bindRange('#p-env-rotation', '#v-env-rotation', (v) => {
      appState.update(s => { s.environment.rotation = v; });
      return `${v}°`;
    });
    this._el.querySelector('#p-env-bg')?.addEventListener('change', (e) => {
      appState.update(s => { s.environment.showBackground = (e.target as HTMLInputElement).checked; });
    });

    // Material finish
    this._bindRange('#p-mat-roughness', '#v-mat-roughness', (v) => {
      appState.update(s => { s.material.roughness = v; });
      return v.toFixed(2);
    });
    this._bindRange('#p-mat-metalness', '#v-mat-metalness', (v) => {
      appState.update(s => { s.material.metalness = v; });
      return v.toFixed(2);
    });

    // Quality
    this._bind('#p-atlas-quality', 'change', (v) => appState.update(s => { s.quality.atlasQuality = v as any; }));
    this._bind('#p-pixel-quality', 'change', (v) => appState.update(s => { s.quality.pixelQuality = parseInt(v) as any; }));
    this._bind('#p-resolution', 'change', (v) => {
      appState.update(s => { s.quality.resolution = v as any; });
      const customRow = this._el.querySelector('#custom-res-row') as HTMLElement;
      customRow.style.display = v === 'custom' ? 'block' : 'none';
    });
    this._bind('#p-aspect', 'change', (v) => appState.update(s => { s.quality.aspectRatio = v as any; }));
    this._el.querySelector('#p-custom-w')?.addEventListener('change', (e) => {
      appState.update(s => { s.quality.customWidth = parseInt((e.target as HTMLInputElement).value); });
    });
    this._el.querySelector('#p-custom-h')?.addEventListener('change', (e) => {
      appState.update(s => { s.quality.customHeight = parseInt((e.target as HTMLInputElement).value); });
    });
    this._el.querySelector('#p-transparent-bg')?.addEventListener('change', (e) => {
      appState.update(s => { s.quality.transparentBackground = (e.target as HTMLInputElement).checked; });
    });
    this._el.querySelector('#p-quality-ao')?.addEventListener('change', (e) => {
      appState.update(s => { s.quality.ambientOcclusion = (e.target as HTMLInputElement).checked; });
    });

    this._bind('#p-cam-mode', 'change', (v) => appState.update(s => { s.camera.mode = v as any; }));
    this._bindRange('#p-cam-fov', '#v-cam-fov', (v) => {
      appState.update(s => { s.camera.fov = v; });
      return `${v}° / ${fovToMM(v)}mm`;
    });
    this._bindRange('#p-cam-exposure', '#v-cam-exposure', (v) => {
      appState.update(s => { s.camera.exposure = v; });
      return v.toFixed(2);
    });
    this._bind('#p-tonemap', 'change', (v) => appState.update(s => { s.camera.toneMapping = v as any; }));

    // Bookmarks
    this._el.querySelector('#p-bookmark-save')?.addEventListener('click', () => {
      const nameInput = this._el.querySelector('#p-bookmark-name') as HTMLInputElement;
      const name = nameInput.value.trim();
      if (!name || !this._cameraManager) return;
      this._cameraManager.saveBookmark(name);
      this._refreshBookmarks();
      nameInput.value = '';
    });

    this._el.querySelector('#p-cam-reset')?.addEventListener('click', () => {
      this._cameraManager?.reset();
    });
    this._el.querySelector('#p-cam-frame')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('frame-model'));
    });
  }

  private _refreshBookmarks(): void {
    const list = this._el.querySelector('#bookmark-list')!;
    const bookmarks = this._cameraManager?.bookmarks ?? [];
    list.innerHTML = bookmarks.map(b => `
      <div class="bookmark-item">
        <span>${b.name}</span>
        <button data-name="${b.name}" class="bm-recall">Go</button>
        <button data-name="${b.name}" class="bm-delete">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('.bm-recall').forEach(btn => {
      (btn as HTMLButtonElement).addEventListener('click', () => {
        const name = (btn as HTMLButtonElement).dataset.name!;
        this._cameraManager?.recallBookmark(name);
      });
    });
    list.querySelectorAll('.bm-delete').forEach(btn => {
      (btn as HTMLButtonElement).addEventListener('click', () => {
        const name = (btn as HTMLButtonElement).dataset.name!;
        this._cameraManager?.deleteBookmark(name);
        this._refreshBookmarks();
      });
    });
  }

  get element(): HTMLElement { return this._el; }
}
