import { createElement } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// No raw HTML, remote images, embeds, or executable URL schemes from model output.
export function markdownUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : "";
  } catch { return ""; }
}

export function ChatMarkdown({ content }: { content: string }) {
  return createElement("div", { className: "chat-markdown" }, createElement(Markdown, {
    remarkPlugins: [remarkGfm], skipHtml: true, urlTransform: markdownUrl,
    components: {
      a: ({ href, children }) => href
        ? createElement("a", { href, target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" }, children)
        : createElement("span", null, children),
      img: ({ alt }) => createElement("span", null, alt || "[이미지]"),
      table: ({ children }) => createElement("div", { className: "chat-table", tabIndex: 0, role: "region", "aria-label": "표 (가로 스크롤)" }, createElement("table", null, children)),
    },
  }, content));
}
