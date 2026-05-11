// Minimal ambient shim for pagedjs — the library ships ES modules without
// types. We only touch `Previewer.preview(content, stylesheets, renderTo)`,
// so we declare the narrow surface here. Expand if we use more APIs.
declare module 'pagedjs' {
  // Each stylesheet entry is either a URL string (fetched via XHR) or a
  // { urlKey: cssString } record for inline CSS. Passing a bare CSS string
  // makes paged.js XHR the string as a relative URL — don't do that.
  type PagedStylesheet = string | Record<string, string>;

  export class Previewer {
    constructor();
    preview(
      content: string | HTMLElement,
      stylesheets: PagedStylesheet[],
      renderTo: HTMLElement,
    ): Promise<{ total: number; pages: unknown[] }>;
  }
}
