/** One continuous texture: head motion fades into the neck instead of splitting it into layers. */
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D uArt;
uniform vec2 uSize;
uniform float uEyes;
uniform float uHead;
uniform float uMouth;
uniform float uMouthWidth;
uniform float uYawn;
varying vec2 vUv;

float closedLidY(float x) {
  // A gently squeezed lid: the middle lifts slightly while the corners stay low.
  float across = clamp(x / 40., -1., 1.);
  return 397. + 5.5 * across * across;
}

// Close the actual photographed eyelids by stretching their own neighbouring fur.
// No replacement skin patches or recoloured irises are composited over the eyes.
vec2 closeEye(vec2 p, float x) {
  // The iris occupies y=383..420 and x=centre±39 in the original texture.
  // Sample fur beyond those edges, including a margin for bilinear filtering.
  float upper = 378., lower = 426., centre = closedLidY(p.x - x);
  float a = mix(upper, centre, uEyes);
  float b = mix(lower, centre, uEyes);
  float sourceY = p.y;
  if (p.y > 335. && p.y < a) sourceY = mix(335., upper, (p.y - 335.) / (a - 335.));
  else if (p.y >= a && p.y <= b) {
    sourceY = mix(upper, lower, clamp((p.y - a) / max(b - a, .001), 0., 1.));
    // Do not squeeze the iris into a moving gold line after the lids have met.
    sourceY = mix(sourceY, p.y < centre ? upper - 2. : lower + 2., smoothstep(.96, 1., uEyes));
  }
  else if (p.y > b && p.y < 465.) sourceY = mix(lower, 465., (p.y - b) / (465. - b));
  float weight = 1. - smoothstep(44., 64., abs(p.x - x));
  p.y = mix(p.y, sourceY, weight);
  return p;
}

vec3 shadeClosedLid(vec3 fur, vec2 p, float x) {
  // Keep the closed eye readable as a crease in the same material, not a flat
  // skin patch. This follows the lid warp and fades away as the eye reopens.
  float across = abs(p.x - x) / 40.;
  float taper = 1. - smoothstep(.72, 1.06, across);
  float amount = smoothstep(.72, .98, uEyes) * taper;
  float distance = p.y - closedLidY(p.x - x);
  float crease = exp(-pow(distance / 1.8, 2.));
  float softShadow = exp(-pow(distance / 4.2, 2.));
  float lowerLid = exp(-pow((distance - 3.2) / 2., 2.));
  return fur * (1. + amount * (.16 * lowerLid - .56 * crease - .13 * softShadow));
}

float ellipse(vec2 p, vec2 centre, vec2 radius) {
  return (length((p - centre) / radius) - 1.) * min(radius.x, radius.y);
}

void main() {
  vec2 p = vec2(vUv.x, 1. - vUv.y) * uSize;
  // Full image coordinates are those of the unchanged 1698 x 926 transparent artwork.
  float neckWeight = 1. - smoothstep(480., 590., p.y);
  float angle = .017 * uHead * neckWeight;
  vec2 offset = p - vec2(846., 520.);
  vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * offset + vec2(846., 520.);
  q.y += 8. * uHead * neckWeight;
  vec2 jaw = q;
  float jawWeight = (1. - smoothstep(65., 160., abs(q.x - 846.))) * smoothstep(430., 495., q.y) * (1. - smoothstep(520., 570., q.y));
  jaw.y -= uMouth * 4. * jawWeight;
  vec2 skin = closeEye(closeEye(jaw, 762.5), 931.5);
  // Keep the complete nose and muzzle rigid: eyelid feathering must not pull
  // their outer edges into points. q contains only the head's rotation/translation here.
  float muzzle = 1. - smoothstep(1., 1.3, length((q - vec2(846., 426.)) / vec2(44., 28.)));
  skin = mix(skin, q, muzzle);
  vec4 colour = texture2D(uArt, vec2(skin.x / uSize.x, 1. - skin.y / uSize.y));
  colour.rgb = shadeClosedLid(shadeClosedLid(colour.rgb, q, 762.5), q, 931.5);

  if (uMouth > .005) {
    float height = 40. * uMouth;
    float width = 28. * uMouthWidth;
    float mouthTop = 446.; // Below the unchanged muzzle, including its lower edge.
    vec2 centre = vec2(846., mouthTop + height);
    float rim = ellipse(q, centre, vec2(width + 2., height + 2.));
    float inside = ellipse(q, centre, vec2(width, height));
    float opacity = smoothstep(.005, .1, uMouth);
    float edge = (1. - smoothstep(-.6, .7, rim)) * opacity;
    float cavity = 1. - smoothstep(-.5, .6, inside);
    float depth = clamp((q.y - centre.y) / max(height, 1.), 0., 1.);
    vec3 mouth = mix(vec3(.016, .014, .022), vec3(.13, .075, .1), depth * depth);
    mouth = mix(vec3(.07, .07, .09), mouth, cavity);
    float tongue = 1. - smoothstep(-.6, .7, ellipse(q, centre + vec2(0., height * .55), vec2(width * .58, max(1., height * .27))));
    mouth = mix(mouth, mix(vec3(.36,.21,.26), vec3(.59,.38,.42), 1. - depth), tongue * cavity * .9);
    float toothY = (q.y - (mouthTop + height * .12)) / max(1., height * .32);
    float toothX = abs(abs(q.x - centre.x) - width * .5);
    float tooth = (1. - smoothstep(width * .14 * (1. - toothY) - .4, width * .14 * (1. - toothY) + .4, toothX));
    tooth *= smoothstep(0., .08, toothY) * (1. - smoothstep(.85, 1., toothY)) * uYawn;
    mouth = mix(mouth, vec3(.72,.65,.54), clamp(tooth, 0., 1.) * cavity);
    colour.rgb = mix(colour.rgb, mouth * colour.a, edge);
  }
  gl_FragColor = colour;
}
`;

export type CatArtworkPose = { eyes: number; head: number; mouth: number; mouthWidth: number; yawn: number };
export const RESTING_CAT_POSE: CatArtworkPose = { eyes: 0, head: 0, mouth: 0, mouthWidth: 1, yawn: 0 };

export function createCatArtworkRenderer(canvas: HTMLCanvasElement, art: HTMLImageElement) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  function shader(type: number, source: string) {
    const result = gl!.createShader(type)!;
    gl!.shaderSource(result, source);
    gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) { gl!.deleteShader(result); throw new Error("Character shader failed"); }
    return result;
  }
  const vertex = shader(gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  gl.useProgram(program);
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
  gl.uniform2f(gl.getUniformLocation(program, "uSize"), art.naturalWidth, art.naturalHeight);
  const uniforms = Object.fromEntries(["eyes", "head", "mouth", "mouthWidth", "yawn"].map(key => [key, gl.getUniformLocation(program, `u${key[0].toUpperCase()}${key.slice(1)}`)]));
  return {
    draw(pose: CatArtworkPose) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      for (const [key, value] of Object.entries(pose)) gl.uniform1f(uniforms[key], value);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() { gl.deleteTexture(texture); gl.deleteBuffer(vertices); gl.deleteProgram(program); },
  };
}
