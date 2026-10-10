/** Collects geometries, materials and textures so a scene can free GPU memory in one call. */
export class DisposableBag {
  private items: { dispose: () => void }[] = [];

  add<T extends { dispose: () => void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  disposeAll() {
    this.items.forEach((d) => d.dispose());
    this.items = [];
  }
}
