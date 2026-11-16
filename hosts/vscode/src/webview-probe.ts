// A seam for the integration tests. The VS Code API cannot click inside a webview, so the probe stands in for the
// pages: it hands a message to the same function that the page's `onDidReceiveMessage` calls, and records what the
// host posted back. `activate` only creates one in Test mode; otherwise the host gets none and the paths do not change.

/** What `activate` returns in Test mode: the integration suite reads it from `extension.exports`. */
export interface TestApi {
  probe: WebviewProbe;
}

/** Hands a message to a page's handler, as `onDidReceiveMessage` would; resolves when the host has handled it. */
export type Receive = (message: unknown) => Promise<void>;

export class WebviewProbe {
  /** Every message the host posted to the panel pages, oldest first. */
  readonly posted: unknown[] = [];
  private panel: Receive | undefined;
  private confirmation: Receive | undefined;

  /** The host bound a panel page; `receive` is what that page's `onDidReceiveMessage` calls. The last one wins. */
  panelBound(receive: Receive): void {
    this.panel = receive;
  }

  /** The host posted `message` to the panel pages. */
  record(message: unknown): void {
    this.posted.push(message);
  }

  /** The give-up confirmation tab opened; `receive` is what its `onDidReceiveMessage` calls. */
  confirmationOpened(receive: Receive): void {
    this.confirmation = receive;
  }

  /** The confirmation tab that `receive` belongs to closed. */
  confirmationClosed(receive: Receive): void {
    if (this.confirmation === receive) this.confirmation = undefined;
  }

  /**
   * Delivers `message` as if the panel page had posted it; resolves once the host has handled it, `false` when no page
   * is bound.
   */
  async toPanel(message: unknown): Promise<boolean> {
    if (!this.panel) return false;
    await this.panel(message);
    return true;
  }

  /** Delivers `message` as if the open confirmation tab had posted it; `false` when none is open. */
  toConfirmation(message: unknown): boolean {
    if (!this.confirmation) return false;
    void this.confirmation(message);
    return true;
  }
}
