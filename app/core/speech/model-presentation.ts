// Renderer-safe: no Node imports, so the UI can import it at runtime.
/** The engine as a detail worth showing: null when it equals, contains or sits inside the model id. */
export function distinctEngine(model: {
  readonly id: string;
  readonly engine: string;
}): string | null {
  const id = model.id.toLowerCase();
  const engine = model.engine.toLowerCase();
  return id.includes(engine) || engine.includes(id) ? null : model.engine;
}
