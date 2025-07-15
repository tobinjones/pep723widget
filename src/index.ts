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
    header.textContent = 'PEP 723 Dependency Manager';
    container.appendChild(header);

    // Validate the notebook state
    const validationResult = this._validateNotebook();

    if (!validationResult.valid) {
      this._createErrorPage(container, validationResult.error!);
      this.node.appendChild(container);
      return;
    }

    // Show the main interface
    this._createMainInterface(container);
    this.node.appendChild(container);
  }

  private _createErrorPage(container: HTMLElement, error: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'pep723-error';
    errorDiv.innerHTML = `
      <div class="error-icon">⚠️</div>
      <h3>Configuration Error</h3>
      <p>${error}</p>
      <div class="error-help">
        <h4>Requirements:</h4>
        <ul>
          <li>PEP 723 metadata must be in the first cell of the notebook</li>
          <li>The cell must contain only PEP 723 metadata and whitespace</li>
          <li>No other code or comments should be present in the cell</li>
        </ul>
      </div>
    `;
    container.appendChild(errorDiv);
  }

  private _createMainInterface(container: HTMLElement): void {
    const notebookInfo = document.createElement('div');
    notebookInfo.className = 'notebook-info';
    notebookInfo.innerHTML = `
      <p><strong>Notebook:</strong> ${this._context.path}</p>
      <p><strong>Status:</strong> Ready for dependency management</p>
    `;
    container.appendChild(notebookInfo);

    // Current metadata display
    const metadataSection = document.createElement('div');
    metadataSection.className = 'metadata-section';
    this._updateMetadataContent(metadataSection);
    container.appendChild(metadataSection);

    // Dependency management form
    const formSection = document.createElement('div');
    formSection.className = 'dependency-form';
    this._createDependencyForm(formSection);
    container.appendChild(formSection);
  }

  private _createDependencyForm(container: HTMLElement): void {
    const formTitle = document.createElement('h3');
    formTitle.textContent = 'Add New Dependency';
    container.appendChild(formTitle);

    const form = document.createElement('div');
    form.className = 'form-group';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'dependency-input';
    input.placeholder = 'e.g., requests, pandas>=2.0.0, numpy[dev]';
    input.className = 'dependency-input';

    const button = document.createElement('button');
    button.textContent = 'Add Dependency';
    button.className = 'add-dependency-btn';
    button.onclick = () => this._addDependency();

    const status = document.createElement('div');
    status.id = 'status-message';
    status.className = 'status-message';

    form.appendChild(input);
    form.appendChild(button);
    form.appendChild(status);
    container.appendChild(form);
  }

  private _validateNotebook(): { valid: boolean; error?: string } {
    const cells = this._context.model.cells;

    if (cells.length === 0) {
      return { valid: false, error: 'Notebook has no cells.' };
    }

    const firstCell = cells.get(0);
    if (firstCell.type !== 'code') {
      return { valid: false, error: 'First cell must be a code cell.' };
    }

    const source = firstCell.sharedModel.getSource();

    // Use the canonical PEP 723 regex pattern
    // (?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$
    const pep723Regex = /^# \/\/\/ [a-zA-Z0-9-]+$\s(^#( .*)?$\s)+^# \/\/\/$/m;

    if (!pep723Regex.test(source)) {
      return {
        valid: false,
        error: 'First cell must contain valid PEP 723 script metadata.'
      };
    }

    // Check if cell contains only PEP 723 metadata and whitespace
    const lines = source.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        continue; // Allow empty lines
      }
      // Valid PEP 723 lines: # /// type, # content, # ///
      if (
        !trimmed.match(/^# \/\/\/ [a-zA-Z0-9-]+$/) &&
        !trimmed.match(/^#( .*)?$/) &&
        !trimmed.match(/^# \/\/\/$/)
      ) {
        return {
          valid: false,
          error:
            'First cell must contain only PEP 723 metadata and whitespace. Found non-metadata content.'
        };
      }
    }

    // Check that no other cells contain PEP 723 metadata
    const startMarkerRegex = /^# \/\/\/ [a-zA-Z0-9-]+$/m;
    for (let i = 1; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell.type === 'code') {
        const cellSource = cell.sharedModel.getSource();
        if (startMarkerRegex.test(cellSource)) {
          return {
            valid: false,
            error: `PEP 723 metadata found in cell ${i + 1}. Metadata must only be in the first cell.`
          };
        }
      }
    }

    return { valid: true };
  }

  private _updateMetadataContent(container: HTMLElement): void {
    container.innerHTML = '<h3>Current Script Metadata</h3>';

    const firstCell = this._context.model.cells.get(0);
    const source = firstCell.sharedModel.getSource();

    const metadataDiv = document.createElement('div');
    metadataDiv.className = 'current-metadata';
    metadataDiv.innerHTML = `<pre>${source}</pre>`;
    container.appendChild(metadataDiv);
  }

  private async _addDependency(): Promise<void> {
    const input = this.node.querySelector(
      '#dependency-input'
    ) as HTMLInputElement;
    const button = this.node.querySelector(
      '.add-dependency-btn'
    ) as HTMLButtonElement;
    const status = this.node.querySelector('#status-message') as HTMLElement;

    const dependency = input.value.trim();
    if (!dependency) {
      this._showStatus(status, 'Please enter a dependency name.', 'error');
      return;
    }

    // Disable form during request
    input.disabled = true;
    button.disabled = true;
    this._showStatus(status, 'Adding dependency...', 'loading');

    try {
      // Get current script metadata from first cell
      const firstCell = this._context.model.cells.get(0);
      const scriptMetadata = firstCell.sharedModel.getSource();

      // Call backend API
      const response = await requestAPI<any>('add-dependency', {
        method: 'POST',
        body: JSON.stringify({
          script_metadata: scriptMetadata,
          dependency: dependency
        })
      });

      // Update cell content with new metadata
      firstCell.sharedModel.setSource(response.updated_metadata);

      // Update UI
      this._updateMetadataContent(
        this.node.querySelector('.metadata-section')!
      );
      input.value = '';
      this._showStatus(status, `Successfully added "${dependency}"`, 'success');
    } catch (error) {
      console.error('Error adding dependency:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to add dependency';
      this._showStatus(status, `Error: ${errorMessage}`, 'error');
    } finally {
      // Re-enable form
      input.disabled = false;
      button.disabled = false;
    }
  }

  private _showStatus(
    element: HTMLElement,
    message: string,
    type: 'success' | 'error' | 'loading'
  ): void {
    element.textContent = message;
    element.className = `status-message ${type}`;

    if (type !== 'loading') {
      setTimeout(() => {
        element.textContent = '';
        element.className = 'status-message';
      }, 3000);
    }
  }

  private _onContentChanged(): void {
    // Re-create the entire interface to handle validation changes
    this.node.innerHTML = '';
    this._createContent();
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
