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
  private _latestLockfileContent: string | null = null;

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
      if (validationResult.needsInitialization) {
        this._createInitializationPage(container);
      } else {
        this._createErrorPage(container, validationResult.error!);
      }
      this.node.appendChild(container);
      return;
    }

    // Show the main interface
    this._createMainInterface(container);
    this.node.appendChild(container);
  }

  private _createInitializationPage(container: HTMLElement): void {
    const initDiv = document.createElement('div');
    initDiv.className = 'pep723-init';
    initDiv.innerHTML = `
      <div class="init-icon">📋</div>
      <h3>Script metadata not found</h3>
      <p>This notebook doesn't have PEP 723 script metadata configured. Initialize it to start managing dependencies.</p>
      <div class="init-help">
        <h4>What will happen:</h4>
        <ul>
          <li>A PEP 723 metadata cell will be added to the beginning of your notebook</li>
          <li>The metadata will include basic Python requirements</li>
          <li>A lockfile will be generated and stored in the notebook metadata</li>
        </ul>
      </div>
    `;

    const initButton = document.createElement('button');
    initButton.textContent = 'Add metadata cell';
    initButton.className = 'init-btn';
    initButton.onclick = () => this._initializePep723();

    const statusDiv = document.createElement('div');
    statusDiv.id = 'init-status-message';
    statusDiv.className = 'status-message';

    initDiv.appendChild(initButton);
    initDiv.appendChild(statusDiv);
    container.appendChild(initDiv);
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

    // Dependency tree display
    const treeSection = document.createElement('div');
    treeSection.className = 'tree-section';
    this._createTreeDisplay(treeSection);
    container.appendChild(treeSection);

    // Load initial tree
    this._loadInitialTree();
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
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        this._addDependency();
      }
    });

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

  private _validateNotebook(): {
    valid: boolean;
    error?: string;
    needsInitialization?: boolean;
  } {
    const cells = this._context.model.cells;

    if (cells.length === 0) {
      return { valid: false, error: 'Notebook has no cells.' };
    }

    // Check if ANY cell has PEP 723 metadata
    const startMarkerRegex = /^# \/\/\/ [a-zA-Z0-9-]+$/m;
    let hasMetadataAnywhere = false;
    let metadataLocation = -1;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell.type === 'code') {
        const cellSource = cell.sharedModel.getSource();
        if (startMarkerRegex.test(cellSource)) {
          hasMetadataAnywhere = true;
          metadataLocation = i;
          break;
        }
      }
    }

    // If no metadata found anywhere, suggest initialization
    if (!hasMetadataAnywhere) {
      return { valid: false, needsInitialization: true };
    }

    // If metadata is not in first cell, show error
    if (metadataLocation !== 0) {
      return {
        valid: false,
        error: `PEP 723 metadata found in cell ${metadataLocation + 1}. Metadata must only be in the first cell.`
      };
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

    // Check that no other cells contain PEP 723 metadata (already covered above)
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

  private _createTreeDisplay(container: HTMLElement): void {
    const treeTitle = document.createElement('h3');
    treeTitle.className = 'tree-title';
    this._updateTreeTitle(treeTitle);
    container.appendChild(treeTitle);

    const treeContent = document.createElement('div');
    treeContent.className = 'tree-content';
    treeContent.innerHTML = '<p>Loading dependency tree...</p>';
    container.appendChild(treeContent);

    // Lock/Unlock button
    const lockButton = document.createElement('button');
    lockButton.className = 'lock-btn';
    lockButton.onclick = () => this._toggleLock();
    this._updateLockButton(lockButton);
    container.appendChild(lockButton);
  }

  private _updateTreeTitle(titleElement?: HTMLElement): void {
    const title =
      titleElement || (this.node.querySelector('.tree-title') as HTMLElement);
    if (!title) {
      return;
    }

    const lockfileContent = this._context.model.getMetadata('uv.lock') as
      | string
      | undefined;
    const isLocked = lockfileContent !== undefined;

    title.textContent = isLocked ? '🔒 Dependency Tree' : '🔓 Dependency Tree';

    // Update tree content styling based on lock status
    const treeContent = this.node.querySelector('.tree-content') as HTMLElement;
    if (treeContent) {
      if (isLocked) {
        treeContent.classList.remove('unlocked');
      } else {
        treeContent.classList.add('unlocked');
      }
    }
  }

  private _updateTreeDisplay(treeOutput?: string): void {
    const treeContent = this.node.querySelector('.tree-content') as HTMLElement;
    if (treeContent && treeOutput !== undefined) {
      if (treeOutput.trim() === '') {
        treeContent.innerHTML = '<p>No dependencies</p>';
      } else {
        treeContent.innerHTML = `<pre>${treeOutput}</pre>`;
      }
    }
    // Update title to reflect current lock status
    this._updateTreeTitle();
    // Update lock button text
    this._updateLockButton();
  }

  private async _loadInitialTree(): Promise<void> {
    try {
      // Get current script metadata from first cell
      const firstCell = this._context.model.cells.get(0);
      const scriptMetadata = firstCell.sharedModel.getSource();

      // Check for existing lockfile in notebook metadata
      const lockfileContent = this._context.model.getMetadata('uv.lock') as
        | string
        | undefined;

      // Call get-tree API
      const response = await requestAPI<any>('get-tree', {
        method: 'POST',
        body: JSON.stringify({
          script_metadata: scriptMetadata,
          lockfile_content: lockfileContent || null
        })
      });

      // Store latest lockfile content
      this._latestLockfileContent = response.lockfile_content;

      // Update tree display
      this._updateTreeDisplay(response.tree_output);
    } catch (error) {
      console.error('Error loading initial tree:', error);
      const treeContent = this.node.querySelector(
        '.tree-content'
      ) as HTMLElement;
      if (treeContent) {
        treeContent.innerHTML = '<p>Failed to load dependency tree.</p>';
      }
      this._updateTreeTitle();
    }
  }

  private _updateLockButton(buttonElement?: HTMLElement): void {
    const button =
      buttonElement || (this.node.querySelector('.lock-btn') as HTMLElement);
    if (!button) {
      return;
    }

    const lockfileContent = this._context.model.getMetadata('uv.lock') as
      | string
      | undefined;
    const isLocked = lockfileContent !== undefined;

    button.textContent = isLocked ? 'Unlock' : 'Lock';
    button.className = isLocked ? 'lock-btn unlock' : 'lock-btn lock';
  }

  private _toggleLock(): void {
    const lockfileContent = this._context.model.getMetadata('uv.lock') as
      | string
      | undefined;
    const isLocked = lockfileContent !== undefined;

    if (isLocked) {
      // Unlock: delete the metadata key
      this._context.model.deleteMetadata('uv.lock');
    } else {
      // Lock: save the latest lockfile content to metadata
      if (this._latestLockfileContent) {
        this._context.model.setMetadata('uv.lock', this._latestLockfileContent);
      }
    }

    // Update UI to reflect the change
    this._updateTreeTitle();
    this._updateLockButton();
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

      // Check for existing lockfile in notebook metadata
      const lockfileContent = this._context.model.getMetadata('uv.lock') as
        | string
        | undefined;

      // Call backend API
      const response = await requestAPI<any>('add-dependency', {
        method: 'POST',
        body: JSON.stringify({
          script_metadata: scriptMetadata,
          dependency: dependency,
          lockfile_content: lockfileContent || null
        })
      });

      // Update cell content with new metadata
      firstCell.sharedModel.setSource(response.updated_metadata);

      // Store latest lockfile content
      this._latestLockfileContent = response.lockfile_content;

      // Update lockfile in notebook metadata if it already existed
      if (lockfileContent !== undefined && response.lockfile_content) {
        this._context.model.setMetadata('uv.lock', response.lockfile_content);
      }

      // Update UI
      this._updateMetadataContent(
        this.node.querySelector('.metadata-section')!
      );
      this._updateTreeDisplay(response.tree_output);
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

  private async _initializePep723(): Promise<void> {
    const button = this.node.querySelector('.init-btn') as HTMLButtonElement;
    const status = this.node.querySelector(
      '#init-status-message'
    ) as HTMLElement;

    // Disable button during request
    button.disabled = true;
    this._showStatus(status, 'Initializing PEP 723 metadata...', 'loading');

    try {
      // Call backend API to initialize metadata
      const response = await requestAPI<any>('initialize', {
        method: 'POST',
        body: JSON.stringify({})
      });

      // Insert a new cell at the beginning with the metadata
      const notebookModel = this._context.model;

      // Create new code cell with the metadata using the shared model
      notebookModel.sharedModel.insertCell(0, {
        cell_type: 'code',
        source: response.initial_metadata,
        metadata: {
          jupyter: {
            source_hidden: true
          }
        }
      });

      // Store lockfile in notebook metadata (notebooks should be locked by default)
      if (response.lockfile_content) {
        this._context.model.setMetadata('uv.lock', response.lockfile_content);
      }

      this._showStatus(
        status,
        'PEP 723 metadata initialized successfully!',
        'success'
      );

      // Refresh the UI after a short delay to show the success message
      setTimeout(() => {
        this.node.innerHTML = '';
        this._createContent();
      }, 1500);
    } catch (error) {
      console.error('Error initializing PEP 723:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to initialize metadata';
      this._showStatus(status, `Error: ${errorMessage}`, 'error');
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
