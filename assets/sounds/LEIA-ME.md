# Sons

Por padrão o jogo **sintetiza** todos os sons (Web Audio), sem precisar de arquivos.

Para usar arquivos próprios (`.mp3`, `.ogg` ou `.wav`), coloque-os nesta pasta e informe o caminho em `data/audio.json`:

```json
{
  "music": "assets/sounds/musica.mp3",
  "sfx": { "match": "assets/sounds/combinacao.wav", "win": "assets/sounds/vitoria.mp3" }
}
```

Nomes de efeitos disponíveis: select, swap, invalid, match, cascade, special, line, area, combo, win, lose, stage, reflection, star, click, shuffle.
