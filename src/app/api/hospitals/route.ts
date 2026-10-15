import type { Hospital } from "@/app/Hospitals";
import { distanceM } from "@/lib/geo";

// 건강보험심사평가원_병원정보서비스 (data.go.kr 15001698)
const URL_BASE = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const PSYCHIATRY = "03"; // 진료과목코드: 정신건강의학과
const RADIUS_M = 5000;

type Item = { yadmNm?: string; clCdNm?: string; addr?: string; telno?: string; XPos?: string | number; YPos?: string | number };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  // 대략 한국 범위 밖이면 받지 않는다.
  if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) {
    return Response.json({ error: "위치가 올바르지 않아요." }, { status: 400 });
  }

  const key = process.env.HIRA_API_KEY;
  if (!key) {
    console.error("hospitals: HIRA_API_KEY가 설정되지 않았어요 (.env.local)");
    return Response.json({ error: "병원 정보를 불러올 수 없어요." }, { status: 502 });
  }

  const query = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "30",
    dgsbjtCd: PSYCHIATRY,
    xPos: String(lng),
    yPos: String(lat),
    radius: String(RADIUS_M),
    _type: "json",
  });

  try {
    const res = await fetch(`${URL_BASE}?${query}`);
    const text = await res.text();
    if (!res.ok || !text.startsWith("{")) throw new Error(`HIRA ${res.status}: ${text.slice(0, 300)}`);
    // 결과가 하나면 배열이 아니라 객체로, 없으면 빈 문자열로 온다.
    const raw = JSON.parse(text)?.response?.body?.items?.item ?? [];
    const items: Item[] = Array.isArray(raw) ? raw : [raw];

    const list: Hospital[] = items
      .map((it) => {
        const hLat = Number(it.YPos);
        const hLng = Number(it.XPos);
        return {
          name: it.yadmNm ?? "",
          kind: it.clCdNm ?? "",
          addr: it.addr ?? "",
          tel: it.telno ?? "",
          lat: hLat,
          lng: hLng,
          distance: distanceM(lat, lng, hLat, hLng),
        };
      })
      .filter((h) => h.name && Number.isFinite(h.distance))
      .sort((a, b) => a.distance - b.distance); // 중립 기준(거리순)만 쓴다

    return Response.json({ list });
  } catch (err) {
    console.error("hospitals", err);
    return Response.json({ error: "병원 정보를 불러올 수 없어요." }, { status: 502 });
  }
}
