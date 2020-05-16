import * as vscode from "vscode";
import { PlayListTree } from "./tree/playListTree";
import { TrackTreeItem } from "./tree/treeItems";
import { Store } from "./store";
import { showPasswordBox, showUserNameBox } from "./inputs";
import { ChartTree } from "./tree/chartTree";
import { RecommendationTree } from "./tree/recommendationTree";

export function activate(context: vscode.ExtensionContext) { 
  const store = new Store();
  const treeProvider = new PlayListTree(store);
  const chartProvider = new ChartTree(store);
  const recommendationProvider = new RecommendationTree(store);

  store.init().then(() => {
    vscode.window.registerTreeDataProvider("yandex-music-play-lists", treeProvider);
    vscode.window.registerTreeDataProvider("yandex-music-chart", chartProvider);
    vscode.window.registerTreeDataProvider("yandex-music-recommendations", recommendationProvider);
  });

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("yandexMusic.credentials") || e.affectsConfiguration("yandexMusic.credentials")) {
      store.init().then(() => {
        treeProvider.refresh();
        chartProvider.refresh();
      });
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("yandexMusic.play", async (item?: TrackTreeItem) => {
      if (item) {
        store.play({ itemId: item.track.id, playListId: item.playListId });
      } else {
        store.play();
      }
    }),
    vscode.commands.registerCommand("yandexMusic.next", () => {
      store.next();
    }),
    vscode.commands.registerCommand("yandexMusic.prev", () => {
      store.prev();
    }),
    vscode.commands.registerCommand("yandexMusic.pause", () => {
      store.pause();
    }),
    vscode.commands.registerCommand("yandexMusic.rewindForward", () => {
      store.rewind(getRewindTime());
    }),
    vscode.commands.registerCommand("yandexMusic.rewindBackward", () => {
      store.rewind(-getRewindTime());
    }),
    vscode.commands.registerCommand("yandexMusic.downloadTrack", (node: TrackTreeItem) => {
      store.downloadTrack(node.track);
    }),
    vscode.commands.registerCommand("yandexMusic.connect", async () => {
      const credentials = store.getCredentials();
      const username = await showUserNameBox(credentials.username);

      if (!username) {
        return;
      } else {
        store.updateUserName(username);
      }

      const password = await showPasswordBox(credentials.password);

      if (!password) {
        return;
      } else {
        store.updatePassword(password);
      }

      //TODO: need to refresh tree
    }),
  );
}

function getRewindTime(): number {
  const defaultValue = vscode.workspace.getConfiguration("yandexMusic").inspect<number>("rewindTime")?.defaultValue;
  return vscode.workspace.getConfiguration("yandexMusic").get<number>("rewindTime") || defaultValue || 15;
}

// this method is called when your extension is deactivated
export function deactivate() { }
