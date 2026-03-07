/**
 * Test scene for the in-world editor.
 * The editor auto-discovers all entities — no manual registration needed.
 * Name components provide stable identifiers for persistence.
 */

import { createSceneObjects } from './scene-objects'
import { enableEditor } from './__editor'

export function main() {
  createSceneObjects()
  enableEditor()
}
