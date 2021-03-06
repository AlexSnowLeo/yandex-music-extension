import * as vscode from "vscode";
import { getThemeIcon } from "../../utils/iconUtils";
import { Store } from "../../store";

export class NewReleasesTreeItem extends vscode.TreeItem {
  constructor(private store: Store) {
    super("New Releases", vscode.TreeItemCollapsibleState.Collapsed);

    const newReleases = store.getLandingBlock('new-releases');

    if (newReleases) {
      this.label = newReleases.title;
      this.description = newReleases.description;
      this.tooltip = `${newReleases.title}. ${newReleases.description}`;
    }

    //TODO: change icon
    this.iconPath = getThemeIcon("playlist.svg");
  }
}