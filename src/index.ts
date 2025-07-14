import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IDocumentManager } from '@jupyterlab/docmanager';

import {
  DocumentRegistry,
  IDocumentWidget,
  DocumentWidget,
  ABCWidgetFactory
} from '@jupyterlab/docregistry';

import { INotebookModel } from '@jupyterlab/notebook';

import { Widget } from '@lumino/widgets';

import { requestAPI } from './handler';

/**
 * Custom notebook viewer widget that displays PEP 723 metadata
 */
class Pep723NotebookWidget extends Widget {
  private _context: DocumentRegistry.IContext<INotebookModel>;

  constructor(context: DocumentRegistry.IContext<INotebookModel>) {
    super();
    this._context = context;
    this.addClass('pep723-notebook-widget');
    this.title.label = 'PEP 723 Viewer';
    this.title.closable = true;
    this.title.iconClass = 'jp-NotebookIcon';

    this._createContent();
    this._context.model.contentChanged.connect(this._onContentChanged, this);
  }

  private _createContent(): void {
    const container = document.createElement('div');
    container.className = 'pep723-container';

    const header = document.createElement('h2');
    header.textContent = 'PEP 723 Inline Script Metadata Viewer';
    container.appendChild(header);

    const notebookInfo = document.createElement('div');
    notebookInfo.className = 'notebook-info';
    notebookInfo.innerHTML = `
      <p><strong>Notebook:</strong> ${this._context.path}</p>
      <p><strong>Cells:</strong> ${this._context.model.cells.length}</p>
    `;
    container.appendChild(notebookInfo);

    const metadataSection = document.createElement('div');
    metadataSection.className = 'metadata-section';
    this._updateMetadataContent(metadataSection);
    container.appendChild(metadataSection);

    this.node.appendChild(container);
  }

  private _updateMetadataContent(container: HTMLElement): void {
    container.innerHTML = '<h3>PEP 723 Script Metadata</h3>';

    const cells = this._context.model.cells;
    let foundMetadata = false;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell.type === 'code') {
        const source = cell.sharedModel.getSource();

        // Look for PEP 723 script metadata (# /// ... # ///)
        const pep723Regex = /^#\s*\/\/\/\s*(.*)$/gm;
        const matches: RegExpMatchArray[] = [];
        let match: RegExpExecArray | null;
        while ((match = pep723Regex.exec(source)) !== null) {
          matches.push(match);
        }

        if (matches.length > 0) {
          foundMetadata = true;
          const cellDiv = document.createElement('div');
          cellDiv.className = 'pep723-cell';
          cellDiv.innerHTML = `
            <h4>Cell ${i + 1}</h4>
            <pre class="pep723-metadata">${matches.map((m: RegExpMatchArray) => m[1]).join('\n')}</pre>
          `;
          container.appendChild(cellDiv);
        }
      }
    }

    if (!foundMetadata) {
      const noMetadata = document.createElement('p');
      noMetadata.textContent =
        'No PEP 723 script metadata found in this notebook.';
      noMetadata.className = 'no-metadata';
      container.appendChild(noMetadata);
    }
  }

  private _onContentChanged(): void {
    const metadataSection = this.node.querySelector('.metadata-section');
    if (metadataSection) {
      this._updateMetadataContent(metadataSection as HTMLElement);
    }
  }

  dispose(): void {
    this._context.model.contentChanged.disconnect(this._onContentChanged, this);
    super.dispose();
  }
}

/**
 * Widget factory for PEP 723 notebook viewer
 */
class Pep723NotebookWidgetFactory extends ABCWidgetFactory<
  IDocumentWidget<Pep723NotebookWidget, INotebookModel>,
  INotebookModel
> {
  protected createNewWidget(
    context: DocumentRegistry.IContext<INotebookModel>
  ): IDocumentWidget<Pep723NotebookWidget, INotebookModel> {
    const content = new Pep723NotebookWidget(context);
    const widget = new DocumentWidget({ content, context });
    widget.title.label = `PEP 723: ${context.localPath}`;
    return widget;
  }
}

/**
 * Initialization data for the pep723widget extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'pep723widget:plugin',
  description:
    'A JupyterLab extension to edit pep723 inline script metadata in notebooks.',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension pep723widget is activated!');

    // Create and register the widget factory
    const factory = new Pep723NotebookWidgetFactory({
      name: 'pep723-notebook-viewer',
      label: 'PEP 723 Viewer',
      fileTypes: ['notebook'],
      defaultFor: [],
      canStartKernel: false,
      shutdownOnClose: false,
      modelName: 'notebook'
    });

    docManager.registry.addWidgetFactory(factory);

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('pep723widget settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for pep723widget.', reason);
        });
    }

    requestAPI<any>('get-example')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The pep723widget server extension appears to be missing.\n${reason}`
        );
      });
  }
};

export default plugin;
