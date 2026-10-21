import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'drilling' },
  {
    path: 'drilling',
    loadComponent: () =>
      import('./features/drilling/training/training.component').then(
        (m) => m.TrainingComponent
      ),
  },
  // Старый адрес сессии — на экран тренировки (query-параметры сохраняются).
  { path: 'drilling/session', redirectTo: 'drilling' },
  {
    path: 'decks',
    loadComponent: () =>
      import('./features/decks/decks-list/decks-list.component').then(
        (m) => m.DecksListComponent
      ),
  },
  {
    path: 'decks/new',
    loadComponent: () =>
      import('./features/decks/deck-editor/deck-editor.component').then(
        (m) => m.DeckEditorComponent
      ),
  },
  {
    path: 'decks/:deckId',
    loadComponent: () =>
      import('./features/decks/deck-detail/deck-detail.component').then(
        (m) => m.DeckDetailComponent
      ),
  },
  {
    path: 'decks/:deckId/edit',
    loadComponent: () =>
      import('./features/decks/deck-editor/deck-editor.component').then(
        (m) => m.DeckEditorComponent
      ),
  },
  {
    path: 'decks/:deckId/cards/new',
    loadComponent: () =>
      import('./features/cards/card-editor/card-editor.component').then(
        (m) => m.CardEditorComponent
      ),
  },
  {
    path: 'decks/:deckId/cards/:cardId',
    loadComponent: () =>
      import('./features/cards/card-editor/card-editor.component').then(
        (m) => m.CardEditorComponent
      ),
  },
  {
    path: 'library',
    loadComponent: () =>
      import('./features/library/library.component').then(
        (m) => m.LibraryComponent
      ),
  },
  {
    path: 'more',
    loadComponent: () =>
      import('./features/more/more.component').then((m) => m.MoreComponent),
  },
  { path: '**', redirectTo: 'drilling' },
];
