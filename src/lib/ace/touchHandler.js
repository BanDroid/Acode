import tag from "html-tag-js";
import constants from "../constants";
import helpers from "../utils/helpers";

/**
 * Handler for touch events
 * @param {AceAjax.Editor} editor 
 */
export default function addTouchListeners(editor) {
  const { renderer, container: $el } = editor;

  if ($el.touchListeners) {
    Object.keys($el.touchListeners).forEach((key) => {
      $el.touchListeners[key].forEach((event) => {
        $el.removeEventListener(key, event.listener, event.useCapture);
      })
    });
  }

  let {
    diagonalScrolling,
    reverseScrolling,
    teardropSize,
    teardropTimeout,
  } = appSettings.value;

  /**
   * Selection controller start
   */
  const $start = tag('span', {
    className: "cursor start",
    dataset: {
      size: teardropSize,
    },
    ontouchstart: ontouchstart$start,
    size: teardropSize,
  });

  /**
   * Selection controller end
   */
  const $end = tag('span', {
    className: "cursor end",
    dataset: {
      size: teardropSize,
    },
    ontouchstart: ontouchstart$end,
    size: teardropSize,
  });

  /**
   * Tear drop cursor
   */
  const $cursor = tag('span', {
    className: "cursor single",
    dataset: {
      size: teardropSize,
    },
    get size() {
      const widthSq = teardropSize * teardropSize * 2;
      const actualWidth = Math.sqrt(widthSq);
      delete this.size;
      this.size = actualWidth;
      return actualWidth;
    },
    startHide() {
      clearTimeout($cursor.dataset.timeout);
      $cursor.dataset.timeout = setTimeout(() => {
        $cursor.remove();
        hideMenu();
      }, teardropTimeout);
    },
    ontouchstart: ontouchstart$curosr,
  });

  /**
   * Text menu for touch devices
   */
  const $menu = tag('menu', {
    className: 'cursor-menu',
    ontouchstart(e) {
      this.moved = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    ontouchmove(e) {
      this.moved = true;
    },
    ontouchend(e) {
      if (this.moved) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const { action } = e.target.dataset;
      if (!action) return;

      editor.execCommand(action);
      if (action === 'selectall') {
        editor.scrollToRow(Infinity);
        selectionActive = true;
        menuActive = true;
      }
    }
  });

  let scrollTimeout; // timeout to check if scrolling is finished
  let clickTimeout; // timeout to count as a click
  let selectionTimeout; // timeout for context menu
  let menuActive; // true if menu is active
  let selectionActive; // true if selection is active
  let animation; // animation frame id
  let moveY; // touch difference in vertical direction
  let moveX; // touch difference in horizontal direction
  let lastX; // last x
  let lastY; // last y
  let lockX; // lock x for prevent scrolling in horizontal direction
  let lockY; // lock y for prevent scrolling in vertical direction
  let mode; // cursor, selection or scroll
  let clickCount = 0; // number of clicks

  const timeToSelectText = 500; // ms
  const config = {
    passive: false, // allow preventDefault
  };

  renderer.scroller.addEventListener('touchstart', touchStart, config);
  editor.on('change', onupdate);
  editor.on('fold', onfold);
  editor.on('scroll', onscroll);
  editor.on('changeSession', onchangesession);
  appSettings.on('update:diagonalScrolling', (value) => {
    diagonalScrolling = value;
  });
  appSettings.on('update:reverseScrolling', (value) => {
    reverseScrolling = value;
  });
  appSettings.on('update:teardropSize', (value) => {
    teardropSize = value;
    $start.dataset.size = value;
    $end.dataset.size = value;
    $cursor.dataset.size = value;
  });
  appSettings.on('update:textWrap', onupdate);

  /**
   * Editor container on touch start
   * @param {TouchEvent} e 
   */
  function touchStart(e) {
    if ([$cursor, $start, $end, $menu].includes(e.target)) return;
    if ($menu.contains(e.target)) return;
    e.preventDefault();
    cancelAnimationFrame(animation);
    const { clientX, clientY } = e.touches[0];
    lastX = clientX;
    lastY = clientY;
    moveY = 0;
    moveX = 0;
    lockX = false;
    lockY = false;
    mode = 'cursor';
    ++clickCount;

    clearTimeout(clickTimeout);

    selectionTimeout = setTimeout(() => {
      mode = 'selection';
      moveCursorTo(clientX, clientY);
      selection();
    }, timeToSelectText);

    clickTimeout = setTimeout(() => {
      clickCount = 0;
    }, 300);

    document.addEventListener('touchmove', touchMove, config);
    document.addEventListener('touchend', touchEnd, config);
  }

  /**
   * Editor container on touch move
   * @param {TouchEvent} e 
   */
  function touchMove(e) {
    e.preventDefault();
    if (mode === 'selection') {
      removeListeners();
      return;
    }

    const { clientX, clientY } = e.touches[0];

    moveX = clientX - lastX;
    moveY = clientY - lastY;

    if (!moveX && !moveY) {
      return;
    }

    if (!lockX && !lockY) {
      if (Math.abs(moveX) > Math.abs(moveY)) {
        lockY = true;
      } else {
        lockX = true;
      }
    }

    lastX = clientX;
    lastY = clientY;
    mode = 'scroll';
    [moveX, moveY] = testScroll(moveX, moveY);
    scroll(moveX, moveY);
    clearTimeout(selectionTimeout);
  }

  /**
   * Editor container on touch end
   * @param {TouchEvent} e 
   */
  function touchEnd(e) {
    e.preventDefault();
    removeListeners();
    clearTimeout(selectionTimeout);

    const { clientX, clientY } = e.changedTouches[0];

    if (clickCount === 2) {
      mode = 'selection';
    }

    if (mode === 'cursor') {
      moveCursorTo(clientX, clientY);
      cursorMode();
      return;
    }

    if (mode === 'scroll') {
      scrollAnimation(moveX, moveY);
      return;
    }

    if (mode === 'selection') {
      moveCursorTo(clientX, clientY);
      selection();
      clickCount = 0;
    }
  };

  function selection() {
    removeListeners();
    editor.selection.selectWord();

    const copyText = editor.session.getTextRange(editor.getSelectionRange());
    if (!copyText) return;

    selectionMode($end);

    if (appSettings.value.vibrateOnTap) {
      navigator.vibrate(constants.VIBRATION_TIME);
    }
  }

  function scrollAnimation(moveX, moveY) {
    const nextX = moveX * 0.05;
    const nextY = moveY * 0.05;

    let scrollX = parseInt(nextX * 100) / 100;
    let scrollY = parseInt(nextY * 100) / 100;

    const [canScrollX, canScrollY] = testScroll(moveX, moveY);

    if (!canScrollX) {
      moveX = 0;
      scrollX = 0;
    }

    if (!canScrollY) {
      moveY = 0;
      scrollY = 0;
    }

    if (!scrollX && !scrollY) {
      cancelAnimationFrame(animation);
      return;
    }

    scroll(moveX, moveY);
    moveX -= scrollX;
    moveY -= scrollY;

    animation = requestAnimationFrame(
      scrollAnimation.bind(null, moveX, moveY),
    );
  }

  /**
   * BUG: not reliable
   * Test if scrolling is possible
   * @param {number} moveX 
   * @param {number} moveY 
   * @returns 
   */
  function testScroll(moveX, moveY) {
    const vDirection = moveY > 0 ? 'down' : 'up';
    const hDirection = moveX > 0 ? 'right' : 'left';

    const { getEditorHeight, getEditorWidth } = helpers;
    const { scrollLeft } = editor.renderer.scrollBarH;
    const { scrollTop } = editor.renderer.scrollBarV;
    const [editorWidth, editorHeight] = [getEditorWidth(editor), getEditorHeight(editor)];

    if (
      (vDirection === 'down' && scrollTop <= 0)
      || (vDirection === 'up' && scrollTop >= editorHeight)
    ) {
      moveY = 0;
    }

    if (
      (hDirection === 'right' && scrollLeft <= 0)
      || (hDirection === 'left' && scrollLeft >= editorWidth)
    ) {
      moveX = 0;
    }


    return [moveX, moveY];
  }

  function scroll(x, y) {
    let direction = reverseScrolling ? 1 : -1;
    let scrollX = direction * x;
    let scrollY = direction * y;

    if (!diagonalScrolling) {
      if (lockX) {
        scrollX = 0;
      } else {
        scrollY = 0;
      }
    }

    renderer.scrollBy(scrollX, scrollY);
  }

  function removeListeners() {
    document.removeEventListener('touchmove', touchMove, config);
    document.removeEventListener('touchend', touchEnd, config);
  }

  function moveCursorTo(x, y) {
    const pos = renderer.screenToTextCoordinates(x, y);
    editor.gotoLine(pos.row + 1, pos.column);
    editor.focus();
  }

  function cursorMode() {
    if (!teardropSize) return;

    clearTimeout($cursor.dataset.timeout);
    clearSelectionMode();

    const { pageX, pageY } = renderer.textToScreenCoordinates(
      editor.getCursorPosition(),
    );
    const { lineHeight } = renderer;
    const actualHeight = lineHeight;
    const [x, y] = relativePosition(pageX, pageY + actualHeight);
    $cursor.style.left = `${x}px`;
    $cursor.style.top = `${y}px`;
    if (!$cursor.isConnected) $el.append($cursor);
    $cursor.startHide();

    editor.selection.on('changeCursor', clearCursorMode);
  }

  /**
   * Remove cursor mode
   * @returns 
   */
  function clearCursorMode() {
    if (!$el.contains($cursor)) return;
    if ($cursor.dataset.immortal === 'true') return;
    $cursor.remove();
    clearTimeout($cursor.dataset.timeout);

    editor.selection.off('changeCursor', clearCursorMode);
  }

  function selectionMode($trigger) {
    if (!teardropSize) return;

    clearCursorMode();
    selectionActive = true;
    positionEnd();
    positionStart();
    if ($trigger) showMenu($trigger);

    editor.selection.on('changeSelection', clearSelectionMode);
    editor.selection.on('changeCursor', clearSelectionMode);
  }

  function positionStart() {
    const range = editor.getSelectionRange();
    const { pageX, pageY } = renderer.textToScreenCoordinates(range.start);
    const { lineHeight } = renderer;
    const [x, y] = relativePosition(pageX - teardropSize, pageY + lineHeight)

    $start.style.left = `${x}px`;
    $start.style.top = `${y}px`;

    if (!$start.isConnected) $el.append($start);
  }

  function positionEnd() {
    const range = editor.getSelectionRange();
    const { pageX, pageY } = renderer.textToScreenCoordinates(range.end);
    const { lineHeight } = renderer;
    const [x, y] = relativePosition(pageX, pageY + lineHeight);

    $end.style.left = `${x}px`;
    $end.style.top = `${y}px`;

    if (!$end.isConnected) $el.append($end);
  }

  /**
   * Remove selection mode
   * @param {Event} e 
   * @param {boolean} clearActive 
   * @returns 
   */
  function clearSelectionMode(e, clearActive = true) {
    const $els = [$start.dataset.immortal, $end.dataset.immortal];
    if ($els.includes('true')) return;
    if ($el.contains($start)) $start.remove();
    if ($el.contains($end)) $end.remove();
    if (clearActive) {
      selectionActive = false;
    }

    editor.selection.off('changeSelection', clearSelectionMode);
    editor.selection.off('changeCursor', clearSelectionMode);
  }

  /**
 * 
 * @param {HTMLElement} [$trigger] 
 */
  function showMenu($trigger) {
    menuActive = true;
    const rect = $trigger?.getBoundingClientRect();
    const { bottom, left } = rect;
    const readOnly = editor.getReadOnly();
    const [x, y] = relativePosition(left, bottom);
    if (readOnly) {
      menu('read-only');
    } else {
      menu();
    }

    $menu.style.left = `${x}px`;
    $menu.style.top = `${y}px`;

    if (!$menu.isConnected) $el.append($menu);
    if ($trigger) positionMenu($trigger);

    editor.selection.on('changeCursor', hideMenu);
    editor.selection.on('changeSelection', hideMenu);
  }

  function positionMenu($trigger) {
    const rectMenu = $menu.getBoundingClientRect();
    const rectContainer = $el.getBoundingClientRect();
    const { left, right, top, bottom, height } = rectMenu;
    const { size } = $trigger;
    const { lineHeight } = editor.renderer;
    const margin = 10;

    if (!size) return;

    // if menu is positioned off screen horizonatally from the right
    if ((right + margin) > rectContainer.right) {
      const [x] = relativePosition(left - (right - rectContainer.right) - margin);
      $menu.style.left = `${x}px`;
      positionMenu($trigger);
    }

    // if menu is positioned off screen horizonatally from the left
    if ((left - margin) < rectContainer.left) {
      const [x] = relativePosition(left + (rectContainer.left - left) + margin);
      $menu.style.left = `${x}px`;
      positionMenu($trigger);
    }

    // if menu is positioned off screen vertically from the bottom
    if (bottom > rectContainer.bottom) {
      const [, y] = relativePosition(null, top - (bottom - rectContainer.bottom) - size - lineHeight - height);
      $menu.style.top = `${y}px`;
      positionMenu($trigger);
    }

    // if menu is positioned off screen vertically from the top
    if (top < rectContainer.top) {
      const [, y] = relativePosition(null, top + (rectContainer.top - top));
      $menu.style.top = `${y}px`;
      positionMenu($trigger);
    }

  }

  function hideMenu(e, clearActive = true) {
    if (!$el.contains($menu)) return;
    $menu.remove();
    editor.selection.off('changeCursor', hideMenu);
    editor.selection.off('changeSelection', hideMenu);
    if (clearActive) menuActive = false;
  }

  /**
   * Touch start on cursor
   * @param {TouchEvent} e 
   */
  function ontouchstart$curosr(e) {
    handleCursor.call(this, e, 'cursor');
  }

  /**
   * Touch start on selection
   * @param {TouchEvent} e 
   */
  function ontouchstart$start(e) {
    handleCursor.call(this, e, 'start');
  }

  /**
   * Touch start on selection
   * @param {TouchEvent} e 
   */
  function ontouchstart$end(e) {
    handleCursor.call(this, e, 'end');
  }

  /**
   * 
   * @param {TouchEvent} e 
   * @param {'cursor'|'start'|'end'} mode 
   */
  function handleCursor(e, mode) {
    e.preventDefault();
    e.stopImmediatePropagation();
    editor.focus();
    this.dataset.immortal = true;
    let doesShowMenu = true;

    if (mode === 'cursor') {
      clearTimeout($cursor.dataset.timeout);
    }


    const touchMove = (e) => {
      e.preventDefault();
      const { clientX, clientY } = e.touches[0];
      const { lineHeight } = renderer;
      const { start, end } = editor.selection.getRange();
      let y = clientY - (lineHeight * 1.8);
      let line;
      let x = clientX;
      let $el;

      if (mode === 'cursor') {
        const { row, column } = renderer.screenToTextCoordinates(x, y);
        editor.gotoLine(row + 1, column);
        line = row;
        $el = $cursor;
      } else if (mode === 'start') {
        x = clientX + teardropSize;

        const { pageX, pageY } = renderer.textToScreenCoordinates(end);
        if (pageY <= y) {
          y = pageY;
        }

        if (pageY <= y && pageX < x) {
          x = pageX;
        }

        let { row, column } = renderer.screenToTextCoordinates(x, y);

        if (column === end.column) {
          --column;
        }

        editor.selection.setSelectionAnchor(row, column);
        positionEnd();
        line = row;
        $el = $start;
      } else {
        const { pageX, pageY } = renderer.textToScreenCoordinates(start);
        if (pageY >= y) {
          y = pageY;
        }

        if (pageY >= y && pageX > x) {
          x = pageX;
        }

        let { row, column } = renderer.screenToTextCoordinates(x, y);

        if (column === start.column) {
          ++column;
        }

        editor.selection.moveCursorToPosition({ row, column });
        positionStart();
        line = row;
        $el = $end;
      }

      if (!editor.isRowFullyVisible(line)) {
        editor.scrollToLine(line, true, false);
      }

      const [left, top] = relativePosition(clientX, clientY - lineHeight);
      $el.style.left = `${left}px`;
      $el.style.top = `${top}px`;
      doesShowMenu = false;
    };

    const touchEnd = (e) => {
      e.preventDefault();
      if (mode === 'cursor') {
        cursorMode();
      } else {
        selectionMode(this);
      }

      this.dataset.immortal = false;
      document.removeEventListener('touchmove', touchMove, config);
      document.removeEventListener('touchend', touchEnd, config);
      if (doesShowMenu) {
        showMenu(this);
      }
    };

    document.addEventListener('touchmove', touchMove, config);
    document.addEventListener('touchend', touchEnd, config);
  }

  function onscroll() {
    clearTimeout(scrollTimeout);
    clearCursorMode();
    clearSelectionMode(null, false);
    hideMenu(null, false);

    scrollTimeout = setTimeout(onscrollend, 100);
  }

  function onscrollend() {
    if (selectionActive) {
      selectionMode();
    }

    if (menuActive) {
      showMenu($end);
    }
  }

  function onupdate() {
    clearCursorMode();
    clearSelectionMode();
    hideMenu();
  }

  function onchangesession() {
    const copyText = editor.session.getTextRange(editor.getSelectionRange());
    if (!copyText) {
      menuActive = false;
      selectionActive = false;
    } else {
      selectionActive = true;
      menuActive = true;
    }
  }

  function onfold() {
    if (selectionActive) {
      positionEnd();
      positionStart();
      hideMenu();
      showMenu($end);
    } else {
      clearCursorMode();
    }
  }

  function menu(mode = 'regular') {
    $menu.innerHTML = '';

    const menuItem = (text, action) => tag('span', {
      textContent: text,
      dataset: {
        action: action || text,
      },
    });

    const $copy = menuItem(strings.copy, 'copy');
    const $paste = menuItem(strings.paste, 'paste');
    const $cut = menuItem(strings.cut, 'cut');
    const $selectAll = menuItem(strings['select all'], 'selectall');

    const copyText = editor.getCopyText();

    if (mode === 'read-only') {
      if (copyText) {
        $menu.append($copy, $selectAll);
      } else {
        $menu.append($selectAll);
      }
      return;
    }

    if (copyText) {
      $menu.append($copy, $cut, $paste, $selectAll);
    } else {
      $menu.append($paste, $selectAll);
    }
  }

  /**
   * 
   * @param {number} x 
   * @param {number} y 
   * @returns 
   */
  function relativePosition(x, y) {
    const { top, left } = $el.getBoundingClientRect();
    return [x - left, y - top];
  }
}
