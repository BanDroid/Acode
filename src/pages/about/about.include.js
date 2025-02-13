import './about.scss';
import tag from 'html-tag-js';
import mustache from 'mustache';
import Page from '../../components/page';
import _template from './about.hbs';
import helpers from '../../lib/utils/helpers';

export default function AboutInclude() {
  const $page = Page(strings.about.capitalize());

  system.getWebviewInfo(
    (res) => render(res),
    () => render(),
  );

  actionStack.push({
    id: 'about',
    action: $page.hide,
  });

  $page.onhide = function () {
    actionStack.remove('about');
    helpers.hideAd();
  };

  app.append($page);
  helpers.showAd();

  function render(webview) {
    const $content = tag.parse(
      mustache.render(_template, {
        ...BuildInfo,
        webview,
      }),
    );

    $page.classList.add('about-us');
    $page.body = $content;
  }
}
