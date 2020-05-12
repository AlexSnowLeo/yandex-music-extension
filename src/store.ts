import * as vscode from "vscode";
import { FeedResponse, TrackItem, Track, ALL_LANDING_BLOCKS } from "./yandexApi/interfaces";
import { observable, autorun, computed } from "mobx";
import { Player } from "./player";
import { PlayerBarItem } from "./statusbar/playerBarItem";
import { RewindBarItem } from "./statusbar/rewindBarItem";
import { YandexMusicApi } from "./yandexApi/yandexMusicApi";
import * as open from "open";
import { Album } from "./yandexApi/album/album";
import { PlayList } from "./yandexApi/playlist/playList";
import { LandingBlock } from "./yandexApi/landing/block";
import { LandingBlockEntity } from "./yandexApi/landing/blockentity";
import { GeneratedPlayListItem } from "./yandexApi/feed/generatedPlayListItem";
import { ElectronPlayer } from "./electron/electronPlayer";

export interface UserCredentials {
  username: string | undefined;
  password: string | undefined;
}

export const LIKED_TRACKS_PLAYLIST_ID = "LIKED_TRACKS_PLAYLIST_ID";
export const CHART_TRACKS_PLAYLIST_ID = "CHART_TRACKS_PLAYLIST_ID";
export const NEW_RELEASES_PLAYLIST_ID = "NEW_RELEASES_PLAYLIST_ID";
export class Store {
  private electronPlayer = new ElectronPlayer();
  // private player = new Player();
  private playerControlPanel = new PlayerBarItem(this, vscode.StatusBarAlignment.Left, 2000);
  private rewindPanel = new RewindBarItem(this, vscode.StatusBarAlignment.Left, 2001);
  private landingBlocks: LandingBlock[] = [];
  @observable isPlaying = false;
  private playLists = new Map<string | number, Track[]>();
  @observable private currentTrackIndex: number | undefined;
  //TODO add "type PlayListId = string | number | undefined;"
  @observable private currentPlayListId: string | number | undefined;

  api = new YandexMusicApi();

  isAuthorized(): boolean {
    return this.api.isAutorized;
  }

  @computed get currentTrack(): Track | null {
    if (this.currentPlayListId == null || this.currentTrackIndex == null) {
      return null;
    }
    return this.getTrack(this.currentPlayListId, this.currentTrackIndex);
  }

  @computed get nextTrack(): Track | null {
    if (this.currentPlayListId == null || this.currentTrackIndex == null) {
      return null;
    }

    return this.getTrack(this.currentPlayListId, this.currentTrackIndex + 1);
  }

  @computed get prevTrack(): Track | null {
    if (this.currentPlayListId == null || this.currentTrackIndex == null) {
      return null;
    }

    return this.getTrack(this.currentPlayListId, this.currentTrackIndex - 1);
  }

  @computed get hasNextTrack(): boolean {
    return this.nextTrack != null;
  }

  @computed get hasPrevTrack(): boolean {
    return this.prevTrack != null;
  }

  @computed get hasCurrentTrack(): boolean {
    return this.currentTrack != null;
  }

  constructor() { }

  updateUserName(newUserName: string) {
    vscode.workspace.getConfiguration("yandexMusic.credentials").update("username", newUserName, vscode.ConfigurationTarget.Global);
  }

  updatePassword(newPassword: string) {
    vscode.workspace.getConfiguration("yandexMusic.credentials").update("password", newPassword, vscode.ConfigurationTarget.Global);
  }

  getCredentials(): UserCredentials {
    const configuration = vscode.workspace.getConfiguration("yandexMusic.credentials");
    const username = configuration.get<string>("username");
    const password = configuration.get<string>("password");

    return {
      username,
      password,
    };
  }

  async init(): Promise<void> {
    const credentials = this.getCredentials();

    if (credentials.username && credentials.password) {
      try {
        await this.api.init({
          username: credentials.username,
          password: credentials.password,
        });

        await this.api.getLanding(...ALL_LANDING_BLOCKS).then((resp) => {
          this.landingBlocks = resp.data.result.blocks;
        });

        // this.player.on("ended", () => {
        //   this.next();
        // });

        this.electronPlayer.on("ended", () => {
          this.next();
        });

        autorun(() => {
          vscode.commands.executeCommand("setContext", "yandexMusic.isPlaying", this.isPlaying);
        });
      } catch (ex) {
        debugger;
      }
    }

    return await Promise.resolve();
  }

  getLandingBlock(type: string) {
    return this.landingBlocks
      .find((item) => item.type === type);
  }

  getGeneratedPlayLists(): PlayList[] {
    return (this.getLandingBlock("personal-playlists")
      ?.entities as LandingBlockEntity<GeneratedPlayListItem>[])
      .map((item) => item.data.data);
  }

  async getUserPlaylists() {
    return this.api.getAllUserPlaylists();
  }

  getChart(): Promise<Track[]> {
    return this.api.getAllChartTracks('russia').then((resp) => {
      const tracks = this.exposeTracks(resp.data.result.chart.tracks);
      this.savePlaylist(CHART_TRACKS_PLAYLIST_ID, tracks);

      return tracks;
    });
  }

  getNewReleases(): Promise<Album[]> {
    return this.api.getAllNewReleases().then((resp) => {
      return resp.data.result;
    });
  }

  getNewPlayLists(): Promise<PlayList[]> {
    return this.api.getAllNewPlayLists().then((resp) => {
      return resp.data.result;
    });
  }

  getActualPodcasts(): Promise<Album[]> {
    return this.api.getActualPodcasts().then((resp) => {
      return resp.data.result;
    });
  }

  getAlbumTracks(albumId: number): Promise<Track[]> {
    return this.api.getAlbum(albumId, true).then((resp) => {
      const tracks = (resp.data.result.volumes || []).reduce((a, b) => a.concat(b));
      this.savePlaylist(albumId, tracks);

      return tracks;
    });
  }

  getTracks(userId: string | number | undefined, playListId: string | number) {
    return this.api.getPlaylist(userId, playListId).then((result) => {
      this.savePlaylist(playListId, this.exposeTracks(result.data.result.tracks));

      return result;
    });
  }

  async getLikedTracks(): Promise<Track[]> {
    const resp = await this.api.getLikedTracks();
    this.savePlaylist(LIKED_TRACKS_PLAYLIST_ID, resp.result);

    return resp.result;
  }

  play(track?: { itemId: string; playListId: string | number }) {
    if (track) {
      const tracks = this.playLists.get(track.playListId);
      if (tracks) {
        const index = tracks.findIndex((item) => item.id === track?.itemId);
        if (index !== -1) {
          this.currentPlayListId = track.playListId;
          this.internalPlay(index);
        }
      } else {
        console.error(`playlist ${track?.itemId}`);
      }
      // update current song
    } else {
      // this.player.pause();
      this.electronPlayer.play();
      this.isPlaying = true;
    }
  }

  pause() {
    // this.player.pause();
    this.electronPlayer.pause();
    this.isPlaying = false;
  }

  rewind(sec: number) {
    this.electronPlayer.rewind(sec);
    // this.player.rewind(sec);
  }

  next() {
    this.internalPlay((this.currentTrackIndex ?? 0) + 1);
  }

  prev() {
    this.internalPlay((this.currentTrackIndex ?? 1) - 1);
  }

  async downloadTrack(track: Track) {
    const url = await this.api.getTrackUrl(track.storageDir);
    open(url);
  }

  /**
   *
   * @param index Song index of current playList
   */
  private async internalPlay(index: number) {
    this.currentTrackIndex = index;

    if (this.currentPlayListId) {
      const track = this.playLists.get(this.currentPlayListId)?.[index];

      if (track) {
        const url = await this.api.getTrackUrl(track.storageDir);
        // this.player.setFile(url);
        // this.player.play();
        this.electronPlayer.play(url);
        this.isPlaying = true;
      }
    }
  }

  private exposeTracks(tracks: TrackItem[]): Track[] {
    return tracks.map((item) => <Track>item.track);
  }

  private savePlaylist(playListId: number | string, tracks: Track[]) {
    this.playLists.set(playListId, tracks);
  }

  private getTrack(playListId: number | string, index: number): Track | null {
    const tracks = this.playLists.get(playListId);

    if (tracks == null) {
      return null;
    }

    return tracks[index];
  }
}
