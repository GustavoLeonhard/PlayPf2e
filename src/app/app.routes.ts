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
  {
    path: 'parties',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/party-list/party-list.component').then((m) => m.PartyListComponent),
  },
  {
    path: 'parties/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/party/party.component').then((m) => m.PartyComponent),
  },
  /*
   * Sin guard a propósito: el link de invitación se abre sin sesión, y el propio
   * componente guarda el token y manda a iniciar sesión.
   */
  {
    path: 'join/:token',
    loadComponent: () => import('./pages/join/join.component').then((m) => m.JoinComponent),
  },
  { path: '**', redirectTo: 'characters' },
];
