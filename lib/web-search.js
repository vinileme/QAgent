/** Busca resumida na Wikipedia (pt) — requer internet pontual. */
export async function performWebSearch(query) {
    try {
        const searchRes = await fetch(
            `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`
        );
        const searchData = await searchRes.json();
        if (!searchData.query?.search?.length) return null;

        const bestTitle = searchData.query.search[0].title;
        const extractRes = await fetch(
            `https://pt.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(bestTitle)}&explaintext=1&format=json`
        );
        const extractData = await extractRes.json();
        const pages = extractData.query.pages;
        const extract = pages[Object.keys(pages)[0]].extract;

        return extract ? `Fonte: Wikipedia (${bestTitle})\n${extract}` : null;
    } catch {
        return null;
    }
}

export function extractSearchQuery(aiResponse) {
    const match = aiResponse.match(/\[SEARCH\]\s*(.+)/i);
    if (match) return match[1].trim();
    if (aiResponse.trim().startsWith("[SEARCH]")) {
        return aiResponse.replace(/\[SEARCH\]/gi, "").trim();
    }
    return null;
}
