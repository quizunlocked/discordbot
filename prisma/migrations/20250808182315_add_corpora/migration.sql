-- CreateTable
CREATE TABLE "Corpus" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Corpus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusEntry" (
    "id" TEXT NOT NULL,
    "corpusId" TEXT NOT NULL,
    "questionVariants" TEXT[],
    "answerVariants" TEXT[],
    "hintTitles" TEXT[],
    "hintVariants" JSONB NOT NULL,

    CONSTRAINT "CorpusEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Corpus_title_key" ON "Corpus"("title");

-- AddForeignKey
ALTER TABLE "CorpusEntry" ADD CONSTRAINT "CorpusEntry_corpusId_fkey" FOREIGN KEY ("corpusId") REFERENCES "Corpus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
