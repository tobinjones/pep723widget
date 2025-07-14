import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './handler';

/**
 * Initialization data for the pep723widget extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'pep723widget:plugin',
  description: 'A JupyterLab extension to edit pep723 inline script metadata in notebooks.',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension pep723widget is activated!');

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
