import '../styles/main.scss';
import '../styles/themes.scss';
import '../styles/page.scss';
import '../styles/list.scss';
import '../styles/sidenav.scss';
import '../styles/tile.scss';
import '../styles/contextMenu.scss';
import '../styles/dialogs.scss';
import '../styles/help.scss';
import '../styles/overrideAceStyle.scss';
import 'core-js/stable';
import 'html-tag-js/dist/polyfill';
import Irid from 'irid';
import tag from 'html-tag-js';
import mustache from 'mustache';
import git from './git';
import tile from '../components/tile';
import sidenav from '../components/sidenav';
import contextMenu from '../components/contextMenu';
import EditorManager from './editorManager';
import ActionStack from './actionStack';
import helpers from './utils/helpers';
import Settings from './settings';
import dialogs from '../components/dialogs';
import constants from './constants';
import intentHandler from './handlers/intent';
import openFolder from './openFolder';
import arrowkeys from './handlers/arrowkeys';
import commands from './commands';
import keyBindings from './keyBindings';
import quickTools from './handlers/quickTools';
import rateBox from '../components/dialogboxes/rateBox';
import loadPolyFill from './utils/polyfill';
import Url from './utils/Url';
import applySettings from './applySettings';
import fsOperation from './fileSystem/fsOperation';
import ajax from './utils/ajax';
import run from './run';
import toast from '../components/toast';
import $_menu from '../views/menu.hbs';
import $_fileMenu from '../views/file-menu.hbs';
import $_hintText from '../views/hint-txt.hbs';

loadPolyFill.apply(window);
window.onload = Main;

async function Main() {
  const oldPreventDefault = TouchEvent.prototype.preventDefault;
  TouchEvent.prototype.preventDefault = function () {
    if (this.cancelable) {
      oldPreventDefault.bind(this)();
    }
  };

  /**
   * @type {Promotion}
   */
  const promotion = await ajax({
    url: 'https://acode.foxdebug.com/api/getad',
    responseType: 'json',
  });
  window.promotion = promotion;
  if (promotion.image) {
    const image = await ajax({
      url: promotion.image,
      responseType: 'arraybuffer',
    });

    if (image instanceof ArrayBuffer) {
      promotion.image = URL.createObjectURL(new Blob([image]));
    }
  }

  document.addEventListener('deviceready', initGlobalVariables);
}

async function initGlobalVariables() {
  const {
    externalCacheDirectory, //
    externalDataDirectory,
    cacheDirectory,
    dataDirectory,
  } = cordova.file;

  window.root = tag(window.root);
  window.app = tag(document.body);
  window.addedFolder = [];
  window.fileClipBoard = null;
  window.restoreTheme = restoreTheme;
  window.saveInterval = null;
  window.editorManager = null;
  window.customKeyBindings = null;
  window.defaultKeyBindings = keyBindings;
  window.toastQueue = [];
  window.toast = toast;
  window.ANDROID_SDK_INT = await new Promise((resolve, reject) =>
    system.getAndroidVersion(resolve, reject)
  );
  window.IS_FREE_VERSION = /(free)$/.test(BuildInfo.packageName);
  window.DATA_STORAGE = externalDataDirectory || dataDirectory;
  window.CACHE_STORAGE = externalCacheDirectory || cacheDirectory;
  window.KEYBINDING_FILE = Url.join(DATA_STORAGE, '.key-bindings.json');
  window.gitRecordFile = Url.join(DATA_STORAGE, 'git/.gitfiles');
  window.gistRecordFile = Url.join(DATA_STORAGE, 'git/.gistfiles');
  window.actionStack = ActionStack();
  window.appSettings = new Settings();
  window.DOES_SUPPORT_THEME = (() => {
    const $testEl = tag('div', {
      style: {
        height: `var(--test-height)`,
        width: `var(--test-height)`,
      },
    });
    document.body.append($testEl);
    const client = $testEl.getBoundingClientRect();

    $testEl.remove();

    if (client.height === 0) return false;
    else return true;
  })();
  window.Acode = {
    exec(key, val) {
      if (key in commands) {
        return commands[key](val);
      } else {
        return false;
      }
    },
    get exitAppMessage() {
      const numFiles = editorManager.hasUnsavedFiles();
      if (numFiles) {
        return strings['unsaved files close app'];
      }
    },
  };
  window.keyBindings = (name) => {
    if (customKeyBindings && name in window.customKeyBindings)
      return window.customKeyBindings[name].key;
    else if (name in defaultKeyBindings) return defaultKeyBindings[name].key;
    else return null;
  };

  ondeviceready();
}

async function ondeviceready() {
  const appDir = cordova.file.applicationDirectory;
  const language = navigator.language.toLowerCase();
  const oldRURL = window.resolveLocalFileSystemURL;
  const { permissions } = cordova.plugins;
  const requiredPermissions = [permissions.WRITE_EXTERNAL_STORAGE];
  let lang = null;

  localStorage.versionCode = BuildInfo.versionCode;
  document.body.setAttribute('data-version', 'v' + BuildInfo.version);
  document.body.setAttribute('data-small-msg', 'Loading settings...');

  window.resolveLocalFileSystemURL = function (url, ...args) {
    oldRURL.call(this, Url.safe(url), ...args);
  };

  requiredPermissions.forEach((permission, i) => {
    permissions.checkPermission(permission, (status) => {
      if (!status.hasPermission) {
        permissions.requestPermission(requiredPermissions[i], () => {});
      }
    });
  });

  if (navigator.app && typeof navigator.app.clearCache === 'function') {
    navigator.app.clearCache();
  }

  if (!BuildInfo.debug) {
    setTimeout(() => {
      if (document.body.classList.contains('loading'))
        alert(
          'Something went wrong! Please clear app data and restart the app or wait.'
        );
    }, 1000 * 30);
  }

  setTimeout(() => {
    if (document.body.classList.contains('loading'))
      document.body.setAttribute(
        'data-small-msg',
        'This is taking unexpectedly long time!'
      );
  }, 1000 * 10);

  if (language in constants.langList) {
    lang = language;
  }
  document.body.setAttribute('data-small-msg', 'Loading settings...');
  await appSettings.init(lang);

  if (localStorage.versionCode < 150) {
    localStorage.clear();
    appSettings.reset();
    window.location.reload();
  }

  document.body.setAttribute('data-small-msg', 'Loading modules...');
  document.head.append(
    tag('style', {
      id: 'custom-theme',
      textContent: helpers.jsonToCSS(
        constants.CUSTOM_THEME,
        appSettings.value.customTheme
      ),
    })
  );

  document.body.setAttribute('data-small-msg', 'Loading language...');
  try {
    const languageFile = `${appDir}www/lang/${appSettings.value.lang}.json`;
    const fs = await fsOperation(languageFile);
    const text = await fs.readFile('utf-8');
    window.strings = helpers.parseJSON(text);
  } catch (error) {
    alert('Unable to start app.');
    navigator.app.exit();
  }

  document.body.setAttribute('data-small-msg', 'Loading styles...');
  try {
    const fs = await fsOperation(Url.join(appDir, 'www/css/build/'));
    const styles = await fs.lsDir();
    await helpers.loadStyles(...styles.map((style) => style.url));
  } catch (error) {
    alert('Unable to start app.');
    navigator.app.exit();
  }

  document.body.setAttribute('data-small-msg', 'Loading keybindings...');
  try {
    const fs = await fsOperation(KEYBINDING_FILE);
    const content = await fs.readFile('utf-8');
    const bindings = helpers.parseJSON(content);
    if (bindings) {
      window.customKeyBindings = bindings;
    }
  } catch (error) {
    helpers.resetKeyBindings();
  }

  document.body.setAttribute('data-small-msg', 'Loading editor...');
  await helpers.loadScripts(
    './res/ace/src/ace.js',
    './res/ace/emmet-core.js',
    './res/ace/src/ext-language_tools.js',
    './res/ace/src/ext-code_lens.js',
    './res/ace/src/ext-emmet.js',
    './res/ace/src/ext-beautify.js',
    './res/ace/src/ext-modelist.js'
  );
  ace.config.set('basePath', './res/ace/src/');
  window.modelist = ace.require('ace/ext/modelist');
  window.AceMouseEvent = ace.require('ace/mouse/mouse_event').MouseEvent;

  document.body.setAttribute('data-small-msg', 'Initializing GitHub...');
  await git.init();

  window.beautify = ace.require('ace/ext/beautify').beautify;
  startApp();
}

async function startApp() {
  //#region declaration
  const $editMenuToggler = tag('span', {
    className: 'icon edit',
    attr: {
      style: 'font-size: 1.2em !important;',
      action: '',
    },
  });
  const $toggler = tag('span', {
    className: 'icon menu',
    attr: {
      action: 'toggle-sidebar',
    },
  });
  const $menuToggler = tag('span', {
    className: 'icon more_vert',
    attr: {
      action: 'toggle-menu',
    },
  });
  const $header = tile({
    type: 'header',
    text: 'Acode',
    lead: $toggler,
    tail: $menuToggler,
  });
  const $footer = tag('footer', {
    id: 'quick-tools',
    tabIndex: -1,
    onclick: quickTools.clickListener,
  });
  const $mainMenu = contextMenu({
    top: '6px',
    right: '6px',
    toggle: $menuToggler,
    transformOrigin: 'top right',
    innerHTML: () => {
      return mustache.render($_menu, strings);
    },
  });
  const $fileMenu = contextMenu({
    toggle: $editMenuToggler,
    top: '6px',
    transformOrigin: 'top right',
    innerHTML: () => {
      const file = editorManager.activeFile;
      return mustache.render(
        $_fileMenu,
        Object.assign(strings, {
          file_mode: (file.session.getMode().$id || '').split('/').pop(),
          file_encoding: file.encoding,
          file_read_only: !file.editable,
          file_info: !!file.uri,
        })
      );
    },
  });
  const $main = tag('main');
  const $sidebar = sidenav($main, $toggler);
  const $runBtn = tag('span', {
    className: 'icon play_arrow',
    attr: {
      action: 'run-file',
    },
    onclick() {
      Acode.exec('run');
    },
    oncontextmenu() {
      Acode.exec('run-file');
    },
    style: {
      fontSize: '1.2em',
    },
  });
  const $headerToggler = tag('span', {
    className: 'floating icon keyboard_arrow_left',
    id: 'header-toggler',
  });
  const $quickToolToggler = tag('span', {
    className: 'floating icon keyboard_arrow_up',
    id: 'quicktool-toggler',
  });
  const actions = constants.COMMANDS;
  let registeredKey = '';
  //#endregion

  actionStack.onCloseApp = () => Acode.exec('save-state');
  Acode.$menuToggler = $menuToggler;
  Acode.$editMenuToggler = $editMenuToggler;
  Acode.$headerToggler = $headerToggler;
  Acode.$quickToolToggler = $quickToolToggler;
  Acode.$runBtn = $runBtn;

  $sidebar.setAttribute('empty-msg', strings['open folder']);
  window.editorManager = EditorManager($sidebar, $header, $main);

  const fmode = appSettings.value.floatingButtonActivation;
  const activationMode = fmode === 'long tap' ? 'oncontextmenu' : 'onclick';
  $headerToggler[activationMode] = function () {
    root.classList.toggle('show-header');
    this.classList.toggle('keyboard_arrow_left');
    this.classList.toggle('keyboard_arrow_right');
  };
  $quickToolToggler[activationMode] = function () {
    Acode.exec('toggle-quick-tools');
  };

  //#region rendering
  applySettings.beforeRender();
  window.restoreTheme();
  root.append($header, $main, $footer, $headerToggler, $quickToolToggler);
  if (!appSettings.value.floatingButton) {
    root.classList.add('hide-floating-button');
  }
  applySettings.afterRender();
  //#endregion

  editorManager.onupdate = onEditorUpdate;
  app.addEventListener('click', onClickApp);
  $fileMenu.addEventListener('click', handleMenu);
  $mainMenu.addEventListener('click', handleMenu);
  $footer.addEventListener('touchstart', footerTouchStart);
  $footer.addEventListener('contextmenu', footerOnContextMenu);
  document.addEventListener('backbutton', actionStack.pop);
  document.addEventListener('keydown', handleMainKeyDown);
  document.addEventListener('keyup', handleMainKeyUp);
  $sidebar.onshow = function () {
    const activeFile = editorManager.activeFile;
    if (activeFile) editorManager.editor.blur();
  };

  document.body.setAttribute('data-small-msg', 'Loading files...');
  loadFolders();
  await loadFiles();
  document.body.removeAttribute('data-small-msg');

  window.intent.setNewIntentHandler(intentHandler);
  window.intent.getCordovaIntent(intentHandler, function (e) {
    console.error('Error: Cannot handle open with file intent', e);
  });
  document.addEventListener('menubutton', $sidebar.toggle);
  navigator.app.overrideButton('menubutton', true);
  document.addEventListener('pause', () => {
    Acode.exec('save-state');
  });
  document.addEventListener('resume', () => {
    Acode.exec('check-files');
  });

  setTimeout(() => {
    app.classList.remove('loading', 'splash');
    if (localStorage.count === undefined) localStorage.count = 0;
    let count = +localStorage.count;

    if (count === constants.RATING_COUNT) askForRating();
    else if (count === constants.DONATION_COUNT) askForDonation();
    else ++localStorage.count;

    editorManager.onupdate('loading-complete');

    if (!localStorage.__init) {
      localStorage.__init = true;
      if (!BuildInfo.debug) {
        const title = strings.info.toUpperCase();
        const body = mustache.render($_hintText, {
          lang: appSettings.value.lang,
        });
        dialogs.box(title, body).wait(12000);
      }
    }
  }, 500);

  /**
   *
   * @param {KeyboardEvent} e
   */
  function handleMainKeyDown(e) {
    registeredKey = helpers.getCombination(e);
  }

  /**
   *
   * @param {KeyboardEvent} e
   */
  function handleMainKeyUp(e) {
    let key = helpers.getCombination(e);
    if (registeredKey && key !== registeredKey) return;

    const { editor } = editorManager;

    const isFocused = editor.textInput.getElement() === document.activeElement;
    if (key === 'escape' && (!actionStack.length || isFocused))
      e.preventDefault();
    if (actionStack.length || isFocused) return;
    for (let name in keyBindings) {
      const obj = keyBindings[name];
      const binding = (obj.key || '').toLowerCase();
      if (binding === key && actions.includes(name) && 'action' in obj)
        Acode.exec(obj.action);
    }

    registeredKey = null;
  }

  function loadFiles() {
    return new Promise((resolve) => {
      (async () => {
        const files = helpers.parseJSON(localStorage.files) || [];
        const lastfile = localStorage.lastfile;

        for (let file of files) {
          let text = '';
          const {
            cursorPos, //
            isUnsaved,
            filename,
            type,
            uri,
            id,
            readOnly,
            mode,
            deltedFile,
          } = file;
          const render = files.length === 1 || id === lastfile;

          try {
            const fs = await fsOperation(Url.join(CACHE_STORAGE, id));
            text = await fs.readFile('utf-8');
          } catch (error) {}

          document.body.setAttribute(
            'data-small-msg',
            `Loading ${filename}...`
          );

          if (type === 'git') {
            gitRecord.get(file.sha).then((record) => {
              if (record) {
                editorManager.addNewFile(filename, {
                  type: 'git',
                  text: text || record.data,
                  isUnsaved: isUnsaved,
                  record,
                  render,
                  cursorPos,
                  id,
                });
              }
            });
          } else if (type === 'gist') {
            const gist = gistRecord.get(file.recordid, file.isNew);
            if (gist) {
              const gistFile = gist.files[filename];
              editorManager.addNewFile(filename, {
                type: 'gist',
                text: text || gistFile.content,
                isUnsaved,
                record: gist,
                render,
                cursorPos,
                id,
              });
            }
          } else if (uri) {
            try {
              const fs = await fsOperation(uri);
              if (!text) {
                text = await fs.readFile('utf-8');
              } else if (!(await fs.exists()) && !readOnly) {
                uri = null;
                isUnsaved = true;
                dialogs.alert(
                  strings.info.toUpperCase(),
                  strings['file has been deleted'].replace('{file}', filename)
                );
              }

              if (text) {
                editorManager.addNewFile(filename, {
                  uri,
                  render,
                  isUnsaved,
                  cursorPos,
                  readOnly,
                  text,
                  id,
                  mode,
                  deltedFile,
                });
              }
            } catch (error) {
              continue;
            }
          } else {
            editorManager.addNewFile(filename, {
              render,
              isUnsaved,
              cursorPos,
              text,
              id,
            });
          }
        }

        if (!editorManager.files.length) {
          editorManager.addNewFile();
        }
        resolve();
      })();
    });
  }

  function loadFolders() {
    try {
      const folders = JSON.parse(localStorage.folders);
      folders.map((folder) => openFolder(folder.url, folder.opts));
    } catch (error) {}
  }

  /**
   *
   * @param {MouseEvent} e
   */
  function handleMenu(e) {
    const $target = e.target;
    const action = $target.getAttribute('action');
    const value = $target.getAttribute('value');
    if (!action) return;

    if ($mainMenu.contains($target)) $mainMenu.hide();
    if ($fileMenu.contains($target)) $fileMenu.hide();
    Acode.exec(action, value);
  }

  function footerTouchStart(e) {
    arrowkeys.onTouchStart(e, $footer);
  }

  /**
   *
   * @param {MouseEvent} e
   */
  function footerOnContextMenu(e) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    e.preventDefault();
    editorManager.editor.focus();
  }

  function onEditorUpdate(type) {
    const activeFile = editorManager.activeFile;
    const $save = $footer.querySelector('[action=save]');

    if (!$editMenuToggler.isConnected)
      $header.insertBefore($editMenuToggler, $header.lastChild);

    if (activeFile) {
      if (activeFile.isUnsaved) {
        activeFile.assocTile.classList.add('notice');
        if ($save) $save.classList.add('notice');
      } else {
        activeFile.assocTile.classList.remove('notice');
        if ($save) $save.classList.remove('notice');
      }

      editorManager.editor.setReadOnly(!activeFile.editable);

      if (type !== 'remove-file') {
        run
          .checkRunnable()
          .then((res) => {
            if (res) {
              $runBtn.setAttribute('run-file', res);
              $header.insertBefore($runBtn, $header.lastChild);
            } else {
              $runBtn.removeAttribute('run-file');
              $runBtn.remove();
            }
          })
          .catch((err) => {
            $runBtn.removeAttribute('run-file');
            $runBtn.remove();
          });
      }
    }

    Acode.exec('save-state');
  }
}

function onClickApp(e) {
  let el = e.target;
  if (el instanceof HTMLAnchorElement || checkIfInsideAncher()) {
    e.preventDefault();
    e.stopPropagation();

    window.open(el.href, '_system');
  }

  function checkIfInsideAncher() {
    const allAs = [...tag.getAll('a')];

    for (let a of allAs) {
      if (a.contains(el)) {
        el = a;
        return true;
      }
    }

    return false;
  }
}

function restoreTheme(darken) {
  if (darken && document.body.classList.contains('loading')) return;

  let theme = DOES_SUPPORT_THEME ? appSettings.value.appTheme : 'default';
  const themeList = constants.appThemeList;
  let themeData = themeList[theme];
  let type = themeData.type;

  if (!themeData || (!themeData.isFree && IS_FREE_VERSION)) {
    theme = 'default';
    themeData = themeList[theme];
    appSettings.value.appTheme = theme;
    appSettings.update();
  }

  if (type === 'custom') {
    const color = appSettings.value.customTheme['--primary-color'];
    themeData.primary = Irid(color).toHexString();
    themeData.darken = Irid(themeData.primary).darken(0.4).toHexString();

    type = appSettings.value.customThemeMode;
  }

  let hexColor = darken ? themeData.darken : themeData.primary;

  app.setAttribute('theme', theme);

  if (type === 'dark') {
    NavigationBar.backgroundColorByHexString(hexColor, false);
    StatusBar.backgroundColorByHexString(hexColor);
    StatusBar.styleLightContent();
  } else {
    StatusBar.backgroundColorByHexString(hexColor);

    if (theme === 'default') {
      NavigationBar.backgroundColorByHexString(hexColor, false);
      StatusBar.styleLightContent();
    } else {
      NavigationBar.backgroundColorByHexString(hexColor, true);
      StatusBar.styleDefault();
    }
  }

  document.body.setAttribute('theme-type', type);
}

function askForDonation() {
  if (localStorage.dontAskForDonation) return resetCount();

  //TODO: Add currency to donate
  const options = [[constants.PAYPAL + '/5usd', 'PayPal', 'paypal']];

  if (IS_FREE_VERSION)
    options.push([
      constants.PAID_VERSION,
      'Download paid version',
      'googleplay',
    ]);

  dialogs
    .select(strings['support text'], options, {
      onCancel: resetCount,
    })
    .then((res) => {
      localStorage.dontAskForDonation = true;
      window.open(res, '_system');
      resetCount();
    });
}

function resetCount() {
  localStorage.count = -10;
}

function askForRating() {
  if (!localStorage.dontAskForRating) rateBox();
}
