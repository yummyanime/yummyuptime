import { useEffect } from "react";
import { SITE_URL } from "../data/constants.ts";

function upsertMeta(
    attribute: "name" | "property",
    key: string,
    content: string
) {
    let element = document.head.querySelector<HTMLMetaElement>(
        `meta[${attribute}="${key}"]`
    );
    if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
    }
    element.setAttribute("content", content);
}

function upsertCanonical(href: string) {
    let link = document.head.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]'
    );
    if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
    }
    link.href = href;
}

export function usePageMeta(title: string, description: string) {
    useEffect(() => {
        const canonicalUrl = SITE_URL + window.location.pathname;

        document.title = title;
        upsertMeta("name", "description", description);
        upsertCanonical(canonicalUrl);

        upsertMeta("property", "og:title", title);
        upsertMeta("property", "og:description", description);
        upsertMeta("property", "og:url", canonicalUrl);

        upsertMeta("name", "twitter:title", title);
        upsertMeta("name", "twitter:description", description);
    }, [title, description]);
}
