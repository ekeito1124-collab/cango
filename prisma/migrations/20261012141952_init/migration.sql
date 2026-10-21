-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TRAVELER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReservationMethod" AS ENUM ('APP', 'EMAIL', 'NONE');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('OK', 'LIMITED', 'FULL');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED_BY_TRAVELER', 'CANCELLED_BY_SHOP');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('TRAVELER', 'SHOP');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('TRANSLATION', 'FOOD_INFO', 'CONTENT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TRAVELER',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "cardDemoCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameRomaji" TEXT,
    "category" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[],
    "hoursText" TEXT NOT NULL,
    "openTime" TEXT NOT NULL DEFAULT '10:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',
    "closedDays" INTEGER[],
    "priceMin" INTEGER NOT NULL,
    "priceMax" INTEGER NOT NULL,
    "priceNote" TEXT,
    "reservationMethod" "ReservationMethod" NOT NULL DEFAULT 'APP',
    "languages" TEXT[],
    "halalCertified" BOOLEAN NOT NULL DEFAULT false,
    "halalCertifier" TEXT,
    "dietaryOptions" TEXT[],
    "appealPoints" TEXT[],
    "allergenFreeShopwide" TEXT[],
    "ingredientAdjust" TEXT[],
    "clientele" TEXT,
    "regulars" TEXT,
    "guidebookListed" BOOLEAN,
    "tourListed" BOOLEAN,
    "foundedYear" INTEGER,
    "ownerDistance" TEXT,
    "soloWelcome" BOOLEAN NOT NULL DEFAULT false,
    "maxPartySize" INTEGER NOT NULL DEFAULT 4,
    "timeSlots" TEXT[],
    "requestDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "cancelPolicyCode" TEXT NOT NULL DEFAULT 'STANDARD',
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "ratingSource" TEXT,
    "dailyScenes" TEXT[],
    "normalBusiness" BOOLEAN NOT NULL DEFAULT true,
    "specialOffer" TEXT,
    "ownerWords" TEXT,
    "ownerWordsStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "dailyProfile" JSONB,
    "dailyProfileStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER,
    "allergens" TEXT[],
    "dietary" TEXT[],
    "adjustable" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "conditions" TEXT[],
    "conditionNote" TEXT,
    "approvalDeadline" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "lateMinutes" INTEGER NOT NULL DEFAULT 10,
    "lateRule" TEXT NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "dietary" TEXT[],
    "allergies" TEXT[],
    "message" TEXT,
    "messageLang" TEXT,
    "messageJa" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "conditionsAgreed" TEXT[],
    "conditionNoteAgreed" TEXT,
    "conditionsAgreedAt" TIMESTAMP(3),
    "policyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "policyAgreedAt" TIMESTAMP(3) NOT NULL,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "sender" "MessageSender" NOT NULL,
    "original" TEXT NOT NULL,
    "originalLang" TEXT NOT NULL,
    "translated" TEXT,
    "translatedLang" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "fromShopId" TEXT NOT NULL,
    "toShopId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetConsent" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" TEXT NOT NULL,
    "ja" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "ko" TEXT NOT NULL,
    "fr" TEXT NOT NULL,
    "es" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationCache" (
    "id" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "lang" TEXT,
    "sourceText" TEXT,
    "translatedText" TEXT,
    "context" TEXT,
    "comment" TEXT,
    "shopId" TEXT,
    "userId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_ownerId_key" ON "Shop"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_shopId_date_key" ON "Availability"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_code_version_key" ON "CancellationPolicy"("code", "version");

-- CreateIndex
CREATE INDEX "Reservation_shopId_status_idx" ON "Reservation"("shopId", "status");

-- CreateIndex
CREATE INDEX "Reservation_userId_idx" ON "Reservation"("userId");

-- CreateIndex
CREATE INDEX "Message_shopId_userId_idx" ON "Message"("shopId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_fromShopId_toShopId_key" ON "Referral"("fromShopId", "toShopId");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryTerm_ja_key" ON "GlossaryTerm"("ja");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationCache_sourceHash_targetLang_key" ON "TranslationCache"("sourceHash", "targetLang");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_fromShopId_fkey" FOREIGN KEY ("fromShopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_toShopId_fkey" FOREIGN KEY ("toShopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
