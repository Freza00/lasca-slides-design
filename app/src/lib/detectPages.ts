// Chinese numeral → Arabic digit
const CN_NUMS: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '两': 2,
};
function cnToArabic(s: string): string {
  // "十二" → 12, "二十三" → 23, "三" → 3, "十" → 10
  return s.replace(/[一二三四五六七八九十两]+/g, match => {
    if (match.length === 1) return String(CN_NUMS[match] ?? match);
    let n = 0;
    for (let i = 0; i < match.length; i++) {
      const c = match[i];
      if (c === '十') {
        n = (n || 1) * 10;
      } else {
        const d = CN_NUMS[c] ?? 0;
        n += d;
      }
    }
    return String(n);
  });
}

// Edit verbs that signal a number is a page reference, not content
const EDIT_VERB_RE = /(?:改|修改|设计|重新|换|调|优化|删|加|更新|润色|缩短|扩展|redesign|edit|modify|change|update|fix|delete|add|remove|polish|shorten|expand)/i;

export function detectPages(text: string): number[] | null {
  if (!text) return null;
  // Normalize: Chinese numerals → Arabic, strip spaces around page patterns
  let norm = cnToArabic(text);
  norm = norm.replace(/第\s*(\d)/g, '第$1').replace(/(\d)\s*页/g, '$1页');

  const hasEditVerb = EDIT_VERB_RE.test(norm);

  // ---- English ranges ----

  // "pages 3-5", "pages 3 to 5", "slides 3-5", "slides 3 to 5"
  const enRangeMatch = norm.match(/(?:pages?|slides?)\s+(\d+)\s*(?:-|to)\s*(\d+)/i);
  if (enRangeMatch) {
    const pages = [];
    for (let i = parseInt(enRangeMatch[1]); i <= parseInt(enRangeMatch[2]); i++) pages.push(i);
    return pages;
  }

  // ---- Chinese ranges ----

  // "第3到5页" "第3-5页" "第3~5页" "第3～5页" "第3到5"
  const rangeMatch = norm.match(/第(\d+)\s*[到至\-~～]\s*(\d+)页?/);
  if (rangeMatch) {
    const pages = [];
    for (let i = parseInt(rangeMatch[1]); i <= parseInt(rangeMatch[2]); i++) pages.push(i);
    return pages;
  }
  // "13到15页" "14～15页" — with 页 suffix
  const rangeWithPage = norm.match(/(\d+)\s*[到至\-~～]\s*(\d+)页/);
  if (rangeWithPage) {
    const pages = [];
    for (let i = parseInt(rangeWithPage[1]); i <= parseInt(rangeWithPage[2]); i++) pages.push(i);
    return pages;
  }
  // "16～18" "14-15" — bare range, no 第 or 页, only when edit verb present
  if (hasEditVerb) {
    const bareRange = norm.match(/(\d+)\s*[到至\-~～]\s*(\d+)/);
    if (bareRange) {
      const a = parseInt(bareRange[1]);
      const b = parseInt(bareRange[2]);
      // Sanity: both ≤ 200 and b > a (avoids matching years like "2024-2025")
      if (a <= 200 && b <= 200 && b > a && b - a < 50) {
        const pages = [];
        for (let i = a; i <= b; i++) pages.push(i);
        return pages;
      }
    }
  }

  // ---- English lists ----

  // "pages 3, 5, 7" "pages 3 and 5" "slides 3, 5 and 7"
  const enListMatch = norm.match(/(?:pages?|slides?)\s+([\d][\d,\s]+(?:and\s+\d+)?)/i);
  if (enListMatch) {
    const nums = enListMatch[1].replace(/\band\b/gi, ',').split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n <= 200);
    if (nums.length > 1) return [...new Set(nums)];
    if (nums.length === 1) return nums;
  }

  // ---- English single page ----

  // "page 3", "slide 3"
  const enSingleMatch = norm.match(/(?:page|slide)\s+(\d+)/i);
  if (enSingleMatch) return [parseInt(enSingleMatch[1])];

  // "p3", "p.3", "p 3"
  const enShortMatch = norm.match(/\bp\.?\s*(\d+)\b/i);
  if (enShortMatch && hasEditVerb) return [parseInt(enShortMatch[1])];

  // ---- Chinese multiple mentions ----

  // "第7页和第5页" "第7页、第5页"
  const allMentions = [...norm.matchAll(/第(\d+)页/g)].map(m => parseInt(m[1]));
  if (allMentions.length > 1) return [...new Set(allMentions)];

  // "13页和15页" "13页、15页"
  const barePageMentions = [...norm.matchAll(/(\d+)页/g)].map(m => parseInt(m[1]));
  if (barePageMentions.length > 1) return [...new Set(barePageMentions)];

  // ---- Compact lists ----

  // "第3、5、7页"
  const compactMatch = norm.match(/第([\d][、,，\d\s]+[\d])页/);
  if (compactMatch) {
    const nums = compactMatch[1].split(/[、,，\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (nums.length > 1) return [...new Set(nums)];
  }

  // ---- Single page ----

  // "第7页"
  if (allMentions.length === 1) return allMentions;
  // "15页" with edit context
  if (barePageMentions.length === 1 && hasEditVerb) return barePageMentions;

  // "重新设计 22" — bare number at end of short edit command, no 页
  if (hasEditVerb) {
    // Match trailing number(s) separated by 和/、/,/spaces
    const trailingNums = norm.match(/(?:^|\s)(\d+(?:\s*[和、,，]\s*\d+)*)\s*$/);
    if (trailingNums) {
      const nums = trailingNums[1].split(/[和、,，\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n <= 200);
      if (nums.length > 0) return [...new Set(nums)];
    }
  }

  return null;
}
