// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { test } from '@jupyterlab/galata';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import { expect } from '@playwright/test';

const fileName = 'toolbars.ipynb';

/**
 * Normalize rgba color format for comparison (remove spaces, use .XX instead of 0.XX for decimals < 1)
 */
function normalizeColor(color: string): string {
  return color.replace(/\s/g, '').replace(/,0\./g, ',.');
}

const toolbars: string[][] = [
  ['@jupyterlab/csvviewer-extension:csv', 'toolbar'],
  ['@jupyterlab/csvviewer-extension:tsv', 'toolbar'],
  ['@jupyterlab/fileeditor-extension:plugin', 'toolbar'],
  ['@jupyterlab/htmlviewer-extension:plugin', 'toolbar'],
  ['@jupyterlab/notebook-extension:panel', 'toolbar']
];

/**
 * Adds an item in notebook toolbar using the extension system.
 */
async function addWidgetsInNotebookToolbar(
  page: IJupyterLabPageFixture,
  notebook: string,
  content: string,
  afterElem: string
) {
  await page.notebook.activate(notebook);
  await page.evaluate(
    options => {
      const { content, afterElem } = options;

      // A minimal widget class, with required field for adding an item in toolbar.
      class MinimalWidget {
        constructor(node) {
          this.node = node;
        }
        addClass() {}
        node = null;
        processMessage() {}
        hasClass(name) {
          return false;
        }
        _parent = null;
        get parent() {
          return this._parent;
        }
        set parent(p) {
          this._parent?.layout.removeWidget(this);
          this._parent = p;
        }
      }

      const plugin = {
        id: 'my-test-plugin',
        activate: app => {
          const toolbar = app.shell.activeWidget.toolbar;
          const node = document.createElement('div');
          node.classList.add('jp-CommandToolbarButton');
          node.classList.add('jp-Toolbar-item');
          node.textContent = content;
          const widget = new MinimalWidget(node);
          toolbar.insertAfter(afterElem, content, widget);
        }
      };
      jupyterapp.registerPlugin(plugin);
      jupyterapp.activatePlugin('my-test-plugin');
    },
    { content, afterElem }
  );
}

toolbars.forEach(([plugin, parameter]) => {
  test(`Toolbar commands for ${plugin} must exists`, async ({ page }) => {
    const [toolbarItems, commands] = await page.evaluate(
      async ([plugin, parameter]) => {
        const settings = await window.galata.getPlugin(
          '@jupyterlab/apputils-extension:settings'
        );
        const toolbar = await settings.get(plugin, parameter);

        const commandIds = window.jupyterapp.commands.listCommands();
        return Promise.resolve([
          toolbar.composite as ISettingRegistry.IToolbarItem[],
          commandIds
        ]);
      },
      [plugin, parameter]
    );

    const missingCommands = toolbarItems.filter(
      item => item.command !== undefined && !commands.includes(item.command)
    );
    expect(missingCommands).toEqual([]);
  });
});
test.describe('Toolbar Button', () => {
  test.beforeEach(async ({ page, tmpPath }) => {
    await page.notebook.createNew();
  });

  test('Render Switch Kernel ToolbarButton in default theme', async ({
    page
  }) => {
    const label = page.locator(
      'jp-button.jp-Toolbar-kernelName .jp-ToolbarButtonComponent-label'
    );
    const labelColor = await label.evaluate(el => getComputedStyle(el).color);

    const color = await page.evaluate(() =>
      getComputedStyle(document.body)
        .getPropertyValue('--jp-ui-font-color1')
        .trim()
    );

    expect(normalizeColor(labelColor)).toEqual(normalizeColor(color));
  });

  test('Render Switch Kernel ToolbarButton in dark theme', async ({ page }) => {
    await page.theme.setDarkTheme();
    const label = page.locator(
      'jp-button.jp-Toolbar-kernelName .jp-ToolbarButtonComponent-label'
    );
    const labelColor = await label.evaluate(el => getComputedStyle(el).color);

    const color = await page.evaluate(() =>
      getComputedStyle(document.body)
        .getPropertyValue('--jp-ui-font-color1')
        .trim()
    );

    expect(normalizeColor(labelColor)).toEqual(normalizeColor(color));
  });
});
test('Toolbar widget visibility', async ({ page }) => {
  const workspaceSelector = page.locator('div.jp-WorkspaceSelector');
  await expect(workspaceSelector).toHaveCount(0);
  await page.menu.clickMenuItem('View>Appearance>Show Workspace Indicator');
  await expect(workspaceSelector).toHaveCount(1);
  await expect(workspaceSelector).toHaveText('default');
  await page.menu.clickMenuItem('View>Appearance>Show Workspace Indicator');
  await expect(workspaceSelector).toHaveCount(0);
});

test.describe('Reactive toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.notebook.createNew(fileName);
  });

  test('Reducing toolbar width should display opener item', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');
    await expect(toolbar.locator('.jp-Toolbar-item:visible')).toHaveCount(14);
    await expect(
      toolbar.locator('.jp-Toolbar-responsive-opener')
    ).not.toBeVisible();

    await page.sidebar.setWidth(520);

    await expect(
      toolbar.locator('.jp-Toolbar-responsive-opener')
    ).toBeVisible();

    await expect(toolbar.locator('.jp-Toolbar-item:visible')).toHaveCount(12);
  });

  test('Items in popup toolbar should have the same order', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');

    await page.sidebar.setWidth(520);

    await toolbar.locator('.jp-Toolbar-responsive-opener').click();

    // A 'visible' selector is added because there is another response popup element
    // when running in playwright (don't know where it come from, it is an empty
    // toolbar).
    const popupToolbar = page.locator(
      'body > .jp-Toolbar-responsive-popup:visible'
    );
    const popupToolbarItems = popupToolbar.locator('.jp-Toolbar-item:visible');
    await expect(popupToolbarItems).toHaveCount(3);

    const itemChildClasses = [
      '.jp-DebuggerBugButton',
      '.jp-Toolbar-kernelName',
      '.jp-Notebook-ExecutionIndicator'
    ];

    for (let i = 0; i < (await popupToolbarItems.count()); i++) {
      await expect(
        popupToolbarItems.nth(i).locator(itemChildClasses[i])
      ).toHaveCount(1);
    }
  });

  test('Item added from extension should be correctly placed', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');
    await addWidgetsInNotebookToolbar(
      page,
      'notebook.ipynb',
      'new item 1',
      'cellType'
    );

    const toolbarItems = toolbar.locator('.jp-Toolbar-item:visible');
    await expect(toolbarItems.nth(10)).toHaveText('new item 1');
  });

  test('Item should be correctly placed after resize', async ({ page }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');
    await addWidgetsInNotebookToolbar(
      page,
      'notebook.ipynb',
      'new item 1',
      'cellType'
    );

    await page.sidebar.setWidth(600);
    await toolbar.locator('.jp-Toolbar-responsive-opener').click();

    // A 'visible' selector is added because there is another response popup element
    // when running in playwright (don't know where it come from, it is an empty
    // toolbar).
    const popupToolbar = page.locator(
      'body > .jp-Toolbar-responsive-popup:visible'
    );
    const popupToolbarItems = popupToolbar.locator('.jp-Toolbar-item:visible');

    await expect(popupToolbarItems.nth(1)).toHaveText('new item 1');

    await page.sidebar.setWidth();
    const toolbarItems = toolbar.locator('.jp-Toolbar-item:visible');
    await expect(toolbarItems.nth(10)).toHaveText('new item 1');
  });

  test('Item added from extension should be correctly placed in popup toolbar', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');

    await page.sidebar.setWidth(600);

    await addWidgetsInNotebookToolbar(
      page,
      'notebook.ipynb',
      'new item 1',
      'cellType'
    );

    await toolbar.locator('.jp-Toolbar-responsive-opener').click();

    // A 'visible' selector is added because there is another response popup element
    // when running in playwright (don't know where it come from, it is an empty
    // toolbar).
    const popupToolbar = page.locator(
      'body > .jp-Toolbar-responsive-popup:visible'
    );
    const popupToolbarItems = popupToolbar.locator('.jp-Toolbar-item:visible');

    await expect(popupToolbarItems.nth(1)).toHaveText('new item 1');
  });

  test('Widening an item should push it to the popup and resetting it should bring it back on popup open', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');

    const opener = toolbar.locator('.jp-Toolbar-responsive-opener');
    await expect(opener).not.toBeVisible();
    // Make the item much wider than the toolbar can fit. The ResizeObserver
    // on toolbar items should invalidate the cached width and trigger the
    // overflow recalculation automatically.
    await page.evaluate(() => {
      const node = document.querySelector(
        '[data-jp-item-name="restart-and-run"]'
      ) as HTMLElement;
      node.style.minWidth = '600px';
    });

    await expect(opener).toBeVisible();
    await expect(
      toolbar.locator('[data-jp-item-name="restart-and-run"]:visible')
    ).toHaveCount(0);

    // Reset the item width while it is in the (hidden) popup. The
    // ResizeObserver cannot see this change because the popup has no
    // layout, so the cached width stays stale until the popup is opened.
    await page.evaluate(() => {
      const node = document.querySelector(
        '[data-jp-item-name="restart-and-run"]'
      ) as HTMLElement;
      node.style.minWidth = '';
    });

    // Opening the popup re-measures its items and schedules a resize,
    // which should move the item back to the main toolbar.
    await opener.click();
    await expect(opener).not.toBeVisible();
    await expect(
      toolbar.locator('[data-jp-item-name="restart-and-run"]:visible')
    ).toHaveCount(1);
  });

  test('Hiding a widened item should bring back popup items automatically', async ({
    page
  }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');

    const opener = toolbar.locator('.jp-Toolbar-responsive-opener');
    await expect(opener).not.toBeVisible();

    const initialVisibleCount = await toolbar
      .locator('.jp-Toolbar-item:visible')
      .count();

    // Widen the item just enough so following widgets overflow to the popup,
    // but the item itself still fits in the main toolbar.
    await page.evaluate(() => {
      const node = document.querySelector(
        '[data-jp-item-name="restart-and-run"]'
      ) as HTMLElement;
      node.style.minWidth = '350px';
    });
    await expect(opener).toBeVisible();
    await expect(
      toolbar.locator('[data-jp-item-name="restart-and-run"]:visible')
    ).toHaveCount(1);
    expect(
      await toolbar.locator('.jp-Toolbar-item:visible').count()
    ).toBeLessThan(initialVisibleCount);

    // Hiding the widened item triggers the ResizeObserver on toolbar items
    // (visibility transition), which invalidates its cached width and
    // schedules a resize. The popup items should return to the main toolbar.
    await page.evaluate(() => {
      const node = document.querySelector(
        '[data-jp-item-name="restart-and-run"]'
      ) as HTMLElement;
      node.style.display = 'none';
    });
    await expect(opener).not.toBeVisible();
  });

  test('Item should be correctly removed on ignoring', async ({ page }) => {
    const toolbar = page.locator('.jp-NotebookPanel-toolbar');
    const imageName = 'toolbar-items.png';
    await page.evaluate(async () => {
      await window.jupyterapp.commands.execute('settingeditor:open', {
        query: 'Notebook Panel'
      });
    });

    // Ignore Save
    const checkboxLabel = page
      .locator('div.checkbox >> text=Whether the item is ignored or not')
      .first();
    await checkboxLabel.click();

    await page.activity.activateTab(fileName);
    const saveLocator = toolbar.locator('[data-jp-item-name="save"]');
    await expect(saveLocator).toHaveCount(0, { timeout: 1000 });

    await expect(toolbar).toHaveScreenshot(imageName);
  });
});
