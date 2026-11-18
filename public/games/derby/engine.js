// Derby's renderer is the shared 3D engine with its default "day" preset (golden late-afternoon sun, cumulus sky).
// The implementation lives in ../lib3d/engine.js so other 3D games can reuse it with their own light.
import { Engine as SharedEngine, PRESETS } from '../lib3d/engine.js';

export { FOG, HAZE_GLSL, PRESETS, withPreset } from '../lib3d/engine.js';

export class Engine extends SharedEngine {
    constructor(canvas, preset = PRESETS.day) { super(canvas, preset); }
}
