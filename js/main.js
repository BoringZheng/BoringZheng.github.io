(function () {
  const body = document.body;
  const toggle = document.getElementById('nav-toggle');
  const overlay = document.getElementById('nav-overlay');

  function normalizeDisplayMathBlocks(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }

    const containerCandidates = [];
    if (root.nodeType === 1 && root.classList.contains('article-content')) {
      containerCandidates.push(root);
    }
    root.querySelectorAll('.article-content').forEach(function (node) {
      containerCandidates.push(node);
    });

    containerCandidates.forEach(function (container) {
      // Case A: Typora/Markdown may produce a single <p> with <br>$$<br>...<br>$$.
      // Convert <br> into plain newlines first, so auto-render can parse $$...$$.
      container.querySelectorAll('p').forEach(function (paragraph) {
        const markerCount = (paragraph.textContent.match(/\$\$/g) || []).length;
        const hasBreakTag = /<br\s*\/?\s*>/i.test(paragraph.innerHTML);

        if (markerCount >= 2 && hasBreakTag) {
          const plain = paragraph.innerText.replace(/\r/g, '');
          paragraph.textContent = plain;
        }
      });

      // Case B: Delimiters are split into multiple sibling blocks: <p>$$</p> ... <p>$$</p>
      let cursor = container.firstElementChild;

      while (cursor) {
        const current = cursor;
        cursor = current.nextElementSibling;

        if (current.tagName !== 'P') {
          continue;
        }

        if (current.textContent.trim() !== '$$') {
          continue;
        }

        const blockNodes = [];
        let endNode = null;
        let walker = current.nextElementSibling;

        while (walker) {
          if (walker.tagName === 'P' && walker.textContent.trim() === '$$') {
            endNode = walker;
            break;
          }

          blockNodes.push(walker);
          walker = walker.nextElementSibling;
        }

        if (!endNode) {
          continue;
        }

        const lines = blockNodes
          .map(function (node) {
            return node.textContent;
          })
          .join('\n')
          .trim();

        const merged = document.createElement('p');
        merged.textContent = '$$\n' + lines + '\n$$';

        container.insertBefore(merged, current);

        const toRemove = [current].concat(blockNodes).concat([endNode]);
        toRemove.forEach(function (node) {
          if (node && node.parentNode === container) {
            container.removeChild(node);
          }
        });

        cursor = merged.nextElementSibling;
      }
    });
  }

  function renderMath(root) {
    if (!root || typeof window.renderMathInElement !== 'function') {
      return;
    }

    normalizeDisplayMathBlocks(root);

    window.renderMathInElement(root, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    });
  }


  function normalizeLanguageName(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) {
      return 'text';
    }

    const aliasMap = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      sh: 'bash',
      shell: 'bash',
      yml: 'yaml',
      md: 'markdown',
      plaintext: 'text'
    };

    return aliasMap[value] || value;
  }

  function detectCodeLanguage(block) {
    if (!block || !block.classList) {
      return 'text';
    }

    if (block.matches('figure.highlight')) {
      const langClass = Array.from(block.classList).find(function (cls) {
        return cls !== 'highlight';
      });
      return normalizeLanguageName(langClass);
    }

    const code = block.querySelector('code');
    if (code && code.className) {
      const token = code.className
        .split(/\s+/)
        .map(function (item) {
          return item.trim();
        })
        .find(function (item) {
          return item.indexOf('language-') === 0 || item.indexOf('lang-') === 0;
        });

      if (token) {
        return normalizeLanguageName(token.replace(/^language-/, '').replace(/^lang-/, ''));
      }
    }

    return 'text';
  }

  function extractCodeText(block) {
    if (!block) {
      return '';
    }

    if (block.matches('figure.highlight')) {
      const codePre = block.querySelector('td.code pre') || block.querySelector('pre');
      return codePre ? codePre.innerText.replace(/\n$/, '') : '';
    }

    const pre = block.matches('pre') ? block : block.querySelector('pre');
    return pre ? pre.innerText.replace(/\n$/, '') : '';
  }

  function copyText(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(value);
    }

    return new Promise(function (resolve, reject) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  function createCodeToolbar(container, sourceBlock) {
    const toolbar = document.createElement('div');
    toolbar.className = 'code-tools';

    const lang = document.createElement('span');
    lang.className = 'code-lang';
    lang.textContent = detectCodeLanguage(sourceBlock);

    const button = document.createElement('button');
    button.className = 'code-copy-btn';
    button.type = 'button';
    button.textContent = '����';

    button.addEventListener('click', async function () {
      const source = extractCodeText(sourceBlock);
      const original = button.textContent;

      try {
        await copyText(source);
        button.textContent = '�Ѹ���';
      } catch (error) {
        button.textContent = '����ʧ��';
      }

      window.setTimeout(function () {
        button.textContent = original;
      }, 1400);
    });

    toolbar.appendChild(lang);
    toolbar.appendChild(button);
    container.insertBefore(toolbar, container.firstChild);
  }

  function enhanceCodeBlocks(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }

    root.querySelectorAll('figure.highlight').forEach(function (block) {
      if (block.getAttribute('data-code-enhanced') === '1') {
        return;
      }

      createCodeToolbar(block, block);
      block.setAttribute('data-code-enhanced', '1');
    });

    root.querySelectorAll('pre').forEach(function (pre) {
      if (pre.closest('figure.highlight')) {
        return;
      }

      if (pre.getAttribute('data-code-enhanced') === '1') {
        return;
      }

      let wrapper = pre.parentElement;
      if (!wrapper || !wrapper.classList.contains('code-block-wrap')) {
        wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrap';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
      }

      createCodeToolbar(wrapper, pre);
      pre.setAttribute('data-code-enhanced', '1');
    });
  }
  function closeDrawer() {
    if (!toggle) {
      return;
    }

    body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openDrawer() {
    if (!toggle) {
      return;
    }

    body.classList.add('drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  if (toggle && overlay) {
    toggle.addEventListener('click', function () {
      if (body.classList.contains('drawer-open')) {
        closeDrawer();
        return;
      }

      openDrawer();
    });

    overlay.addEventListener('click', closeDrawer);

    window.addEventListener('resize', function () {
      if (window.innerWidth > 820) {
        closeDrawer();
      }
    });
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return null;
    }

    const bytes = new TextEncoder().encode(value);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function unlockPrivatePost(guard, storageKey) {
    const locked = guard.querySelector('[data-private-locked]');
    const open = guard.querySelector('[data-private-open]');

    if (locked) {
      locked.hidden = true;
    }

    if (open) {
      open.hidden = false;
      enhanceCodeBlocks(open);
      renderMath(open);
    }

    try {
      sessionStorage.setItem(storageKey, '1');
    } catch (error) {
      // Ignore storage quota/privacy mode errors.
    }
  }

  function initPrivateGuard(guard) {
    const passwordHash = String(guard.getAttribute('data-private-password-hash') || '').toLowerCase();
    const encodedPostKey = guard.getAttribute('data-private-post-key') || '';
    const postKey = decodeURIComponent(encodedPostKey) || window.location.pathname;
    const storageKey = 'private-unlocked:' + postKey;
    const form = guard.querySelector('[data-private-form]');
    const input = guard.querySelector('[data-private-input]');
    const errorBox = guard.querySelector('[data-private-error]');

    let alreadyUnlocked = false;
    try {
      alreadyUnlocked = sessionStorage.getItem(storageKey) === '1';
    } catch (error) {
      alreadyUnlocked = false;
    }

    if (alreadyUnlocked) {
      unlockPrivatePost(guard, storageKey);
      return;
    }

    if (!form || !input || !passwordHash) {
      return;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const entered = input.value || '';
      const enteredHash = await sha256Hex(entered);

      if (enteredHash && enteredHash.toLowerCase() === passwordHash) {
        if (errorBox) {
          errorBox.hidden = true;
        }
        unlockPrivatePost(guard, storageKey);
        return;
      }

      if (errorBox) {
        errorBox.hidden = false;
      }
      input.value = '';
      input.focus();
    });
  }

  const privateGuards = document.querySelectorAll('[data-private-guard]');
  privateGuards.forEach(initPrivateGuard);

  window.addEventListener('load', function () {
    enhanceCodeBlocks(document.body);
    renderMath(document.body);
  });
})();

