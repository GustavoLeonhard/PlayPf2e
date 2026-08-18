import type { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'characters' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'characters',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/character-list/character-list.component').then((m) => m.CharacterListComponent),
  },
  {
    path: 'characters/new',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/wizard/wizard.component').then((m) => m.WizardComponent),
  },
  {
    path: 'characters/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/sheet/sheet.component').then((m) => m.SheetComponent),
  },
  {
    path: 'characters/:id/level-up',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/level-up/level-up.component').then((m) => m.LevelUpComponent),
  },
  { path: '**', redirectTo: 'characters' },
];
