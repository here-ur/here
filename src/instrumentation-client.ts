// 앱 화면 코드보다 먼저 한 번 실행된다. 분석은 키가 있고 운영이 아닐 때만 켜진다(src/lib/analytics.ts).
import { startAnalytics } from "./lib/analytics";

startAnalytics();
