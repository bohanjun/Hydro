/*

To add a new language to highlight:
1. Add language in babel in package.json
2. Add new import statement in `components/cmeditor/vjcmeditor.js`
3. Add new import statement in `components/scratchpad/ScratchpadEditorContainer.js`
4. Add new meta data in `components/highlighter/meta.js`

 */

import Prism from 'prismjs';

import Clipboard from 'clipboard';
import Notification from 'vj/components/notification/index';
import i18n from 'vj/utils/i18n';

import languageMeta from './meta';

const languageExtMap = {};

// Map possible language names to Prism language name
languageMeta.forEach((meta) => {
  for (let i = 0; i < meta.ext.length; ++i) {
    if (Prism.languages[meta.ext[i]] !== undefined) {
      // eslint-disable-next-line no-param-reassign
      meta.target = meta.ext[i];
      break;
    }
  }
  meta.ext.forEach((ext) => {
    languageExtMap[ext] = meta.target;
  });
});

// Copy to Clipboard
Prism.plugins.toolbar.registerButton('copy-to-clipboard', (env) => {
  const linkCopy = document.createElement('a');
  linkCopy.href = 'javascript:;'; // eslint-disable-line no-script-url
  linkCopy.textContent = 'Copy';
  const clip = new Clipboard(linkCopy, { text: () => env.code });
  clip.on('success', () => {
    Notification.success(i18n('Content copied to clipboard!'), 1000);
  });
  clip.on('error', () => {
    Notification.error(i18n('Copy failed :('));
  });
  return linkCopy;
});

const invisibles = {
  tab: /\t/,
  crlf: /\r\n/,
  lf: /\n/,
  cr: /\r/,
  space: / /,
};

function addInvisibles(grammar) {
  if (!grammar || grammar.tab) return;
  for (const name in invisibles) {
    if (Object.prototype.hasOwnProperty.call(invisibles, name)) {
      grammar[name] = invisibles[name];
    }
  }
  for (const name in grammar) {
    if (Object.prototype.hasOwnProperty.call(grammar, name) && !invisibles[name]) {
      if (name === 'rest') addInvisibles(grammar.rest);
      else handlerInvisiblesToken(grammar, name); // eslint-disable-line no-use-before-define
    }
  }
}

function handlerInvisiblesToken(tokens, name) {
  const value = tokens[name];
  const type = Prism.util.type(value);
  if (type === 'RegExp') {
    const inside = {};
    tokens[name] = { pattern: value, inside };
    addInvisibles(inside);
  } else if (type === 'Array') {
    for (let i = 0, l = value.length; i < l; i++) handlerInvisiblesToken(value, i);
  } else {
    const inside = value.inside || (value.inside = {});
    addInvisibles(inside);
  }
}

Prism.hooks.add('before-highlight', (env) => {
  if (UserContext.showInvisibleChar) addInvisibles(env.grammar);
});

const prismjsApiWrap = {
  highlightBlocks: ($dom, format) => {
    $dom.find('pre code').get().forEach((code) => {
      const $code = $(code);
      const $pre = $code.parent();
      $pre.addClass('syntax-hl');
      const language = ($(code).attr('class') || '').trim();
      const astyle = language.match(/astyle-([a-z]+)/);
      if (format && astyle && astyle[1]) {
        const [success, result] = format($code.text(), `${UserContext.astyleOptions.trim()} mode=${astyle[1]}`);
        console.log(success.result);
        code.original = $code.text();
        if (!success) Notification.error('Code format fail');
        else $code.text(result);
      }
      // try to map the language name
      const m = language.match(/language-([a-z]+)/);
      if (m && m[1]) {
        const languageName = m[1].toLowerCase();
        if (languageExtMap[languageName]) {
          $(code).attr('class', `language-${languageExtMap[languageName]}`);
        }
      }
      Prism.highlightElement(code);
    });
  },
  highlight: (text, grammar, language) => Prism.highlight(text, grammar, language),
  Prism,
};

export default prismjsApiWrap;
