#include <metal_stdlib>
using namespace metal;

// Pull the existing dark upper lids down over the amber eyes. The surrounding
// forehead supplies the lid texture; everything outside these two regions stays still.
[[ stitchable ]] float2 catBlink(float2 position, float2 size, float blink) {
    float2 p = position / size * float2(1199.0, 1312.0);
    float left = smoothstep(335.0, 357.0, p.x) * (1.0 - smoothstep(510.0, 532.0, p.x));
    float right = smoothstep(663.0, 685.0, p.x) * (1.0 - smoothstep(837.0, 859.0, p.x));
    float amount = clamp(blink, 0.0, 1.0) * max(left, right);
    float top = 451.0 + 77.5 * amount;
    float sourceY = p.y;
    if (p.y > 370.0 && p.y < top) {
        sourceY = 370.0 + (p.y - 370.0) * 81.0 / (top - 370.0);
    } else if (p.y >= top && p.y < 529.0) {
        sourceY = 451.0 + (p.y - top) * 78.0 / max(0.5, 529.0 - top);
    }
    return float2(p.x, sourceY) / float2(1199.0, 1312.0) * size;
}
