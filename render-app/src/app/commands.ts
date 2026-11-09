export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export class CommandStack {
  private _stack: Command[] = [];
  private _pointer = -1;
  private _maxSize = 50;

  execute(cmd: Command): void {
    this._stack.splice(this._pointer + 1);
    cmd.execute();
    this._stack.push(cmd);
    if (this._stack.length > this._maxSize) {
      this._stack.shift();
    } else {
      this._pointer++;
    }
  }

  undo(): boolean {
    if (this._pointer < 0) return false;
    this._stack[this._pointer].undo();
    this._pointer--;
    return true;
  }

  redo(): boolean {
    if (this._pointer >= this._stack.length - 1) return false;
    this._pointer++;
    this._stack[this._pointer].execute();
    return true;
  }

  get canUndo(): boolean { return this._pointer >= 0; }
  get canRedo(): boolean { return this._pointer < this._stack.length - 1; }
}

export const commandStack = new CommandStack();
