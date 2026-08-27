const articleRoot = document.querySelector('#article');

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-zа-яё0-9]+/gi, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

function inlineMarkdown(value) {
  let result = escapeHtml(value);
  const code = [];
  result = result.replace(/`([^`]+)`/g, (_, content) => {
    const token = `@@CODE${code.length}@@`;
    code.push(`<code>${content}</code>`);
    return token;
  });
  result = result
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  code.forEach((snippet, index) => { result = result.replace(`@@CODE${index}@@`, snippet); });
  return result;
}

function markdownToHtml(source) {
  let lines = source.replace(/\r/g, '').split('\n');
  let frontHeadings = 0;
  lines = lines.filter((line) => {
    if (frontHeadings < 3 && /^#{1,3}\s/.test(line)) {
      frontHeadings += 1;
      return false;
    }
    return true;
  });

  const html = [];
  let paragraph = [];
  let quote = [];
  let listType = null;
  let listItems = [];
  let inCode = false;
  let codeLanguage = '';
  let codeLines = [];
  const ids = new Map();

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote><p>${inlineMarkdown(quote.join(' '))}</p></blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (!listType) return;
    html.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushAll = () => { flushParagraph(); flushQuote(); flushList(); };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fence = line.match(/^```\s*(.*)$/);
    if (fence) {
      flushAll();
      if (!inCode) {
        inCode = true;
        codeLanguage = fence[1].trim();
        codeLines = [];
      } else {
        html.push(`<pre><code${codeLanguage ? ` data-language="${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (!line.trim()) { flushAll(); continue; }
    if (/^---+$/.test(line.trim())) { flushAll(); html.push('<hr>'); continue; }

    const separator = lines[lineIndex + 1]?.trim();
    if (/^\|.*\|$/.test(line.trim()) && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separator || '')) {
      flushAll();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const headers = cells(line);
      const alignment = cells(separator).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      const rows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && /^\|.*\|$/.test(lines[lineIndex].trim())) {
        rows.push(cells(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      const head = headers.map((cell, index) => `<th scope="col" class="align-${alignment[index] || 'left'}">${inlineMarkdown(cell)}</th>`).join('');
      const body = rows.map((row) => `<tr>${headers.map((_, index) => `<td class="align-${alignment[index] || 'left'}">${inlineMarkdown(row[index] || '')}</td>`).join('')}</tr>`).join('');
      html.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const sourceLevel = heading[1].length;
      const level = Math.min(4, Math.max(2, sourceLevel + 1));
      const title = heading[2].trim();
      const base = slugify(title) || 'section';
      const count = ids.get(base) || 0;
      ids.set(base, count + 1);
      const id = count ? `${base}-${count + 1}` : base;
      html.push(`<h${level} id="${id}">${inlineMarkdown(title)}</h${level}>`);
      continue;
    }

    const quoteLine = line.match(/^>\s?(.*)$/);
    if (quoteLine) { flushParagraph(); flushList(); quote.push(quoteLine[1]); continue; }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph(); flushQuote();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph(); flushQuote();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ordered[1]);
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return html.join('\n');
}

// Порядок соответствует 27 ASCII-блокам в архивном article.md.
// Несколько соседних блоков могут быть одним смысловым рисунком.
const diagrams = [
  [[1, 2], 'images/07-problem-to-decision.png', 'От проблемы к инженерному решению: раньше и теперь'],
  [[3, 4], 'images/08-engineer-responsibility.png', 'Инженер сохраняет ответственность за результат'],
  [[5, 6, 7], 'images/09-verified-hypothesis.png', 'Проверенная гипотеза: от идеи до GO / NO-GO'],
  [[8], 'images/03-product-development-loop.png', 'AI-native product development loop'],
  [[9], 'images/10-architecture-tradeoffs.png', 'Архитектурный компромисс'],
  [[10, 11], 'images/11-programming-role-shift.png', 'Смена роли в программировании'],
  [[12], 'images/12-agent-experiment-loop.png', 'Экспериментальный цикл агента'],
  [[13], 'images/04-repository-memory.png', 'Репозиторий как память проекта'],
  [[14], 'images/13-rd-knowledge-base.png', 'Накопительная R&D-память'],
  [[15, 16], 'images/14-competitive-funnel.png', 'Скорость проверки идей'],
  [[17], 'images/06-cost-of-attempt.png', 'Стоимость попытки и скорость обучения'],
  [[18], 'images/15-ai-toolkit.png', 'AI в наборе инженерных инструментов'],
  [[19], 'images/16-ai-ready-repository.png', 'AI-ready repository'],
  [[20], 'images/17-ai-research-protocol.png', 'Протокол AI-исследования'],
  [[21], 'images/05-parallel-agents.png', 'Один инженер — несколько исследовательских потоков'],
  [[22], 'images/18-market-radar.png', 'Конкурентный радар'],
  [[23, 24], 'images/19-engineer-role.png', 'Новая роль инженера'],
  [[25, 26, 27], 'images/20-learning-speed-strategy.png', 'Скорость обучения как стратегия']
];

function replaceAsciiDiagrams() {
  const blocks = [...articleRoot.querySelectorAll('pre > code[data-language="text"]')]
    .map((code) => code.parentElement);
  if (blocks.length !== 27) throw new Error(`Ожидалось 27 ASCII-схем, найдено ${blocks.length}`);

  diagrams.forEach(([indexes, image, title]) => {
    const first = blocks[indexes[0] - 1];
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    const caption = document.createElement('figcaption');
    figure.className = 'board';
    figure.setAttribute('aria-label', title);
    img.src = image;
    img.alt = title;
    caption.textContent = title;
    figure.append(img, caption);
    first.replaceWith(figure);
    indexes.slice(1).forEach((index) => blocks[index - 1].remove());
  });
}

function wrapSections() {
  const nodes = [...articleRoot.childNodes];
  let section = null;
  nodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'H2') {
      section = document.createElement('section');
      section.className = 'section';
      articleRoot.insertBefore(section, node);
      section.appendChild(node);
    } else if (section) {
      section.appendChild(node);
    }
  });
}

const embeddedSource = window.ARTICLE_SOURCE;

Promise.resolve(embeddedSource)
  .then((source) => {
    if (!source) throw new Error('В HTML не встроен текст статьи');
    return source.trim();
  })
  .then((source) => {
    articleRoot.innerHTML = markdownToHtml(source);
    replaceAsciiDiagrams();
    wrapSections();
  })
  .catch((error) => {
    articleRoot.innerHTML = `<p class="loading">${escapeHtml(error.message)}. Откройте папку через локальный веб-сервер.</p>`;
  });
