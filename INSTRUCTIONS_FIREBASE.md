# Configuração Necessária: Firebase

Para que o aplicativo funcione online e compartilhado, você precisa configurar um projeto gratuito no Google Firebase.

## Passo 1: Criar Projeto
1. Acesse [Firebase Console](https://console.firebase.google.com/) e faça login com sua conta Google.
2. Clique em **"Criar um projeto"** (ou "Adicionar projeto").
3. Dê um nome (ex: `Gestor-Viking`) e continue (pode desativar o Google Analytics).

## Passo 2: Criar Banco de Dados
1. No menu lateral esquerdo, clique em **"Criação"** > **"Firestore Database"**.
2. Clique em **"Criar banco de dados"**.
3. Escolha o local (ex: `nam5 (us-central)` ou `sao-paulo` se tiver).
4. **IMPORTANTE**: Escolha **"Iniciar no modo de teste"** (Start in test mode).
   - *Isso permite que qualquer pessoa com o link do app escreva no banco. Para um app interno simples, é o mais fácil. Em produção real, você configuraria regras.*

## Passo 3: Registrar o App (Pegar as Chaves)
1. Na tela inicial do projeto (Visão Geral), clique no ícone de código `</>` (Web).
2. Dê um apelido ao app (ex: `GestorWeb`).
3. Clique em "Registrar app".
4. Você verá um código com `const firebaseConfig = { ... }`.
5. **COPIE** apenas o conteúdo dentro das chaves (apiKey, authDomain, etc...).

## Passo 4: Colar no Código
1. Abra o arquivo `firebase-config.js` na pasta do seu projeto.
2. Substitua a parte onde diz `"API_KEY_AQUI"` com os dados que você copiou.

## Passo 5: Ativar Login (Criação de Conta)
Para que o sistema de login funcione:
1. Volte ao **Firebase Console** no seu projeto.
2. No menu lateral, clique em **"Criação"** > **"Authentication"**.
3. Clique em **"Começar" (Get Started)**.
4. Na aba **"Sign-in method"** (Método de login), clique em **"Email/Senha"**.
5. Ative a primeira opção (**Enable**) e Salve.

Isso permitirá que você e seus colegas criem contas com Email e Senha dentro do próprio aplicativo.

## Passo 6: Regras de Segurança (Opcional por enquanto)
O código já filtra para mostrar apenas o que é seu. Mas para segurança máxima no futuro, você pode configurar as Regras do Firestore para:
`allow read, write: if request.auth != null && request.auth.uid == resource.data.uid;`

Mas não se preocupe com isso agora. Apenas com os passos acima o app já está funcional e privado!

