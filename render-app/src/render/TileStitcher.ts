export class TileStitcher {
  private _canvas: OffscreenCanvas | HTMLCanvasElement;
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    if (typeof OffscreenCanvas !== 'undefined') {
      this._canvas = new OffscreenCanvas(width, height);
      this._ctx = this._canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    } else {
      this._canvas = document.createElement('canvas');
      (this._canvas as HTMLCanvasElement).width = width;
      (this._canvas as HTMLCanvasElement).height = height;
      this._ctx = (this._canvas as HTMLCanvasElement).getContext('2d')!;
    }
    this._ctx.clearRect(0, 0, width, height);
  }

  blitTile(
    tileCanvas: HTMLCanvasElement,
    x: number,
    y: number
  ): void {
    this._ctx.drawImage(tileCanvas, x, y);
  }

  async toBlob(): Promise<Blob> {
    if (this._canvas instanceof OffscreenCanvas) {
      return await this._canvas.convertToBlob({ type: 'image/png' });
    } else {
      return new Promise((resolve, reject) => {
        (this._canvas as HTMLCanvasElement).toBlob(
          blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
          'image/png'
        );
      });
    }
  }

  get canvas(): OffscreenCanvas | HTMLCanvasElement {
    return this._canvas;
  }
}
