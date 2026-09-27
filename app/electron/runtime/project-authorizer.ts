import path from 'node:path';
import { authorizedProjectPath } from '../../core/projects/project.js';

/** The set of project paths the host resolved itself; the renderer may only save to these. */
export class ProjectPathAuthorizer {
  private readonly known = new Set<string>();

  authorize(value: string): void {
    this.known.add(path.resolve(value));
  }

  isAuthorized(value: unknown): boolean {
    if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
      return false;
    return this.known.has(path.resolve(value));
  }

  check(value: unknown): string {
    return authorizedProjectPath(value, this.known);
  }
}
