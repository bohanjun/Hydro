/* eslint-disable camelcase */
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const crypto = require('crypto');
const { tmpdir } = require('os');
const bus = require('hydrooj/dist/service/bus');
const markdown = require('./backendlib/markdown.js');

const {
  system, domain, user, setting,
} = global.Hydro.model;
const { Route, Handler, UiContextBase } = global.Hydro.service.server;

class WikiHelpHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get() {
    const LANGS = system.get('hydrooj.langs');
    const languages = {};
    // eslint-disable-next-line guard-for-in
    for (const key in LANGS) {
      languages[LANGS[key].display] = LANGS[key].compile || LANGS[key].execute;
    }
    this.response.body = { languages };
    this.response.template = 'wiki_help.html';
  }
}

class WikiAboutHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get() {
    this.response.template = 'about.html';
  }
}

class UiConstantsHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get() {
    this.response.body = `window.LANGS=${JSON.stringify(setting.langs)}`;
    this.response.type = 'text/javascript';
    this.ctx.set('nolog', '1');
  }
}

class UiSettingsHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get({ domainId }) {
    const [
      header_logo, header_logo_2x,
      nav_logo_dark, nav_logo_light,
      nav_logo_dark_2x, nav_logo_light_2x,
      header_background, header_background_2x,
    ] = system.getMany([
      'ui-default.header_logo', 'ui-default.header_logo_2x',
      'ui-default.nav_logo_dark', 'ui-default.nav_logo_light',
      'ui-default.nav_logo_dark_2x', 'ui-default.nav_logo_light_2x',
      'ui-default.header_background', 'ui-default.header_background2x',
    ]);
    const ddoc = await domain.get(domainId);
    this.response.body = await this.renderHTML('extra.css', {
      header_logo,
      header_logo_2x,
      nav_logo_dark,
      nav_logo_light,
      nav_logo_dark_2x,
      nav_logo_light_2x,
      header_background,
      header_background_2x,
      ...ddoc,
    });
    this.response.type = 'text/css';
    this.ctx.set('nolog', '1');
  }
}

class LocaleHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get({ id }) {
    // eslint-disable-next-line prefer-destructuring
    id = id.split('.')[0];
    // TODO use language_default setting
    if (!global.Hydro.locales[id]) id = system.get('server.language');
    this.response.body = `window.LOCALES=${JSON.stringify(global.Hydro.locales[id])}`;
    this.response.type = 'text/javascript';
    this.ctx.set('nolog', '1');
  }
}

class SetThemeHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async get({ theme }) {
    await user.setById(this.user._id, { theme });
    this.back();
  }
}

class MarkdownHandler extends Handler {
  constructor(args) {
    super(args);
    this.noCheckPermView = true;
  }

  async post({ text, html = false, inline = false }) {
    this.response.body = inline
      ? markdown.renderInline(text, html)
      : markdown.render(text, html);
    this.response.type = 'text/html';
    this.response.status = 200;
  }
}

const getHash = (i) => {
  const shasum = crypto.createHash('sha1');
  const file = readFileSync(join(tmpdir(), 'hydro', 'public', i));
  shasum.update(file);
  return shasum.digest('hex').substr(0, 10);
};

const getUrl = (files) => files.map((i) => `/${i}?${getHash(i)}`);

bus.on('app/started', () => {
  const files = readdirSync(join(tmpdir(), 'hydro', 'public'));
  const pages = files.filter((file) => file.endsWith('.page.js'));
  const themes = files.filter((file) => file.endsWith('.theme.js'));
  UiContextBase.extraPages = getUrl(pages);
  UiContextBase.themes = {};
  for (const theme of themes) {
    UiContextBase.themes[theme] = `/${theme}?${getHash(theme)}`;
  }
});

global.Hydro.handler.ui = async () => {
  Route('wiki_help', '/wiki/help', WikiHelpHandler);
  Route('wiki_about', '/wiki/about', WikiAboutHandler);
  Route('ui_constants', '/ui-constants.js', UiConstantsHandler);
  Route('locale', '/locale/:id', LocaleHandler);
  Route('set_theme', '/set_theme/:id', SetThemeHandler);
  Route('ui_extracss', '/extra.css', UiSettingsHandler);
  Route('markdown', '/markdown', MarkdownHandler);
};
