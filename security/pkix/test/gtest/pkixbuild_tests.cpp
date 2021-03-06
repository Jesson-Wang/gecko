/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This code is made available to you under your choice of the following sets
 * of licensing terms:
 */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* Copyright 2013 Mozilla Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <map>
#include "cert.h"
#include "pkix/pkix.h"
#include "pkixgtest.h"
#include "pkixtestutil.h"

using namespace mozilla::pkix;
using namespace mozilla::pkix::test;

static ByteString
CreateCert(const char* issuerCN, // null means "empty name"
           const char* subjectCN, // null means "empty name"
           EndEntityOrCA endEntityOrCA,
           /*optional modified*/ std::map<ByteString, ByteString>*
             subjectDERToCertDER = nullptr)
{
  static long serialNumberValue = 0;
  ++serialNumberValue;
  ByteString serialNumber(CreateEncodedSerialNumber(serialNumberValue));
  EXPECT_FALSE(ENCODING_FAILED(serialNumber));

  ByteString issuerDER(issuerCN ? CNToDERName(issuerCN) : Name(ByteString()));
  ByteString subjectDER(subjectCN ? CNToDERName(subjectCN) : Name(ByteString()));

  ByteString extensions[2];
  if (endEntityOrCA == EndEntityOrCA::MustBeCA) {
    extensions[0] =
      CreateEncodedBasicConstraints(true, nullptr, Critical::Yes);
    EXPECT_FALSE(ENCODING_FAILED(extensions[0]));
  }

  ScopedTestKeyPair reusedKey(CloneReusedKeyPair());
  ByteString certDER(CreateEncodedCertificate(
                       v3, sha256WithRSAEncryption, serialNumber, issuerDER,
                       oneDayBeforeNow, oneDayAfterNow, subjectDER,
                       *reusedKey, extensions, *reusedKey,
                       sha256WithRSAEncryption));
  EXPECT_FALSE(ENCODING_FAILED(certDER));

  if (subjectDERToCertDER) {
    (*subjectDERToCertDER)[subjectDER] = certDER;
  }

  return certDER;
}

class TestTrustDomain : public TrustDomain
{
public:
  // The "cert chain tail" is a longish chain of certificates that is used by
  // all of the tests here. We share this chain across all the tests in order
  // to speed up the tests (generating keypairs for the certs is very slow).
  bool SetUpCertChainTail()
  {
    static char const* const names[] = {
        "CA1 (Root)", "CA2", "CA3", "CA4", "CA5", "CA6", "CA7"
    };

    for (size_t i = 0; i < MOZILLA_PKIX_ARRAY_LENGTH(names); ++i) {
      const char* issuerName = i == 0 ? names[0] : names[i-1];
      CreateCACert(issuerName, names[i]);
      if (i == 0) {
        rootCACertDER = leafCACertDER;
      }
    }

    return true;
  }

  void CreateCACert(const char* issuerName, const char* subjectName)
  {
    leafCACertDER = CreateCert(issuerName, subjectName,
                               EndEntityOrCA::MustBeCA, &subjectDERToCertDER);
    assert(!ENCODING_FAILED(leafCACertDER));
  }

  ByteString GetLeafCACertDER() const { return leafCACertDER; }

private:
  virtual Result GetCertTrust(EndEntityOrCA, const CertPolicyId&,
                              Input candidateCert,
                              /*out*/ TrustLevel& trustLevel)
  {
    trustLevel = InputEqualsByteString(candidateCert, rootCACertDER)
               ? TrustLevel::TrustAnchor
               : TrustLevel::InheritsTrust;
    return Success;
  }

  virtual Result FindIssuer(Input encodedIssuerName,
                            IssuerChecker& checker, Time time)
  {
    ByteString subjectDER(InputToByteString(encodedIssuerName));
    ByteString certDER(subjectDERToCertDER[subjectDER]);
    Input derCert;
    Result rv = derCert.Init(certDER.data(), certDER.length());
    if (rv != Success) {
      return rv;
    }
    bool keepGoing;
    rv = checker.Check(derCert, nullptr/*additionalNameConstraints*/,
                       keepGoing);
    if (rv != Success) {
      return rv;
    }
    return Success;
  }

  virtual Result CheckRevocation(EndEntityOrCA, const CertID&, Time,
                                 /*optional*/ const Input*,
                                 /*optional*/ const Input*)
  {
    return Success;
  }

  virtual Result IsChainValid(const DERArray&, Time)
  {
    return Success;
  }

  virtual Result VerifySignedData(const SignedDataWithSignature& signedData,
                                  Input subjectPublicKeyInfo)
  {
    return TestVerifySignedData(signedData, subjectPublicKeyInfo);
  }

  virtual Result DigestBuf(Input item, /*out*/ uint8_t *digestBuf,
                           size_t digestBufLen)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result CheckPublicKey(Input subjectPublicKeyInfo)
  {
    return TestCheckPublicKey(subjectPublicKeyInfo);
  }

  std::map<ByteString, ByteString> subjectDERToCertDER;
  ByteString leafCACertDER;
  ByteString rootCACertDER;
};

class pkixbuild : public ::testing::Test
{
public:
  static void SetUpTestCase()
  {
    if (!trustDomain.SetUpCertChainTail()) {
      abort();
    }
  }

protected:

  static TestTrustDomain trustDomain;
};

/*static*/ TestTrustDomain pkixbuild::trustDomain;

TEST_F(pkixbuild, MaxAcceptableCertChainLength)
{
  {
    ByteString leafCACert(trustDomain.GetLeafCACertDER());
    Input certDER;
    ASSERT_EQ(Success, certDER.Init(leafCACert.data(), leafCACert.length()));
    ASSERT_EQ(Success,
              BuildCertChain(trustDomain, certDER, Now(),
                             EndEntityOrCA::MustBeCA,
                             KeyUsage::noParticularKeyUsageRequired,
                             KeyPurposeId::id_kp_serverAuth,
                             CertPolicyId::anyPolicy,
                             nullptr/*stapledOCSPResponse*/));
  }

  {
    ByteString certDER(CreateCert("CA7", "Direct End-Entity",
                                  EndEntityOrCA::MustBeEndEntity));
    ASSERT_FALSE(ENCODING_FAILED(certDER));
    Input certDERInput;
    ASSERT_EQ(Success, certDERInput.Init(certDER.data(), certDER.length()));
    ASSERT_EQ(Success,
              BuildCertChain(trustDomain, certDERInput, Now(),
                             EndEntityOrCA::MustBeEndEntity,
                             KeyUsage::noParticularKeyUsageRequired,
                             KeyPurposeId::id_kp_serverAuth,
                             CertPolicyId::anyPolicy,
                             nullptr/*stapledOCSPResponse*/));
  }
}

TEST_F(pkixbuild, BeyondMaxAcceptableCertChainLength)
{
  static char const* const caCertName = "CA Too Far";

  trustDomain.CreateCACert("CA7", caCertName);

  {
    ByteString certDER(trustDomain.GetLeafCACertDER());
    Input certDERInput;
    ASSERT_EQ(Success, certDERInput.Init(certDER.data(), certDER.length()));
    ASSERT_EQ(Result::ERROR_UNKNOWN_ISSUER,
              BuildCertChain(trustDomain, certDERInput, Now(),
                             EndEntityOrCA::MustBeCA,
                             KeyUsage::noParticularKeyUsageRequired,
                             KeyPurposeId::id_kp_serverAuth,
                             CertPolicyId::anyPolicy,
                             nullptr/*stapledOCSPResponse*/));
  }

  {
    ByteString certDER(CreateCert(caCertName, "End-Entity Too Far",
                                  EndEntityOrCA::MustBeEndEntity));
    ASSERT_FALSE(ENCODING_FAILED(certDER));
    Input certDERInput;
    ASSERT_EQ(Success, certDERInput.Init(certDER.data(), certDER.length()));
    ASSERT_EQ(Result::ERROR_UNKNOWN_ISSUER,
              BuildCertChain(trustDomain, certDERInput, Now(),
                             EndEntityOrCA::MustBeEndEntity,
                             KeyUsage::noParticularKeyUsageRequired,
                             KeyPurposeId::id_kp_serverAuth,
                             CertPolicyId::anyPolicy,
                             nullptr/*stapledOCSPResponse*/));
  }
}

// A TrustDomain that explicitly fails if CheckRevocation is called.
// It is initialized with the DER encoding of a root certificate that
// is treated as a trust anchor and is assumed to have issued all certificates
// (i.e. FindIssuer always attempts to build the next step in the chain with
// it).
class ExpiredCertTrustDomain : public TrustDomain
{
public:
  explicit ExpiredCertTrustDomain(ByteString rootDER)
    : rootDER(rootDER)
  {
  }

  // The CertPolicyId argument is unused because we don't care about EV.
  virtual Result GetCertTrust(EndEntityOrCA endEntityOrCA, const CertPolicyId&,
                              Input candidateCert,
                              /*out*/ TrustLevel& trustLevel)
  {
    Input rootCert;
    Result rv = rootCert.Init(rootDER.data(), rootDER.length());
    if (rv != Success) {
      return rv;
    }
    if (InputsAreEqual(candidateCert, rootCert)) {
      trustLevel = TrustLevel::TrustAnchor;
    } else {
      trustLevel = TrustLevel::InheritsTrust;
    }
    return Success;
  }

  virtual Result FindIssuer(Input encodedIssuerName,
                            IssuerChecker& checker, Time time)
  {
    // keepGoing is an out parameter from IssuerChecker.Check. It would tell us
    // whether or not to continue attempting other potential issuers. We only
    // know of one potential issuer, however, so we ignore it.
    bool keepGoing;
    Input rootCert;
    Result rv = rootCert.Init(rootDER.data(), rootDER.length());
    if (rv != Success) {
      return rv;
    }
    return checker.Check(rootCert, nullptr, keepGoing);
  }

  virtual Result CheckRevocation(EndEntityOrCA, const CertID&, Time,
                                 /*optional*/ const Input*,
                                 /*optional*/ const Input*)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result IsChainValid(const DERArray&, Time)
  {
    return Success;
  }

  virtual Result VerifySignedData(const SignedDataWithSignature& signedData,
                                  Input subjectPublicKeyInfo)
  {
    return TestVerifySignedData(signedData, subjectPublicKeyInfo);
  }

  virtual Result DigestBuf(Input, /*out*/uint8_t*, size_t)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result CheckPublicKey(Input subjectPublicKeyInfo)
  {
    return TestCheckPublicKey(subjectPublicKeyInfo);
  }

private:
  ByteString rootDER;
};

TEST_F(pkixbuild, NoRevocationCheckingForExpiredCert)
{
  const char* rootCN = "Root CA";
  ByteString rootDER(CreateCert(rootCN, rootCN, EndEntityOrCA::MustBeCA,
                                nullptr));
  EXPECT_FALSE(ENCODING_FAILED(rootDER));
  ExpiredCertTrustDomain expiredCertTrustDomain(rootDER);

  ByteString serialNumber(CreateEncodedSerialNumber(100));
  EXPECT_FALSE(ENCODING_FAILED(serialNumber));
  ByteString issuerDER(CNToDERName(rootCN));
  ByteString subjectDER(CNToDERName("Expired End-Entity Cert"));
  ScopedTestKeyPair reusedKey(CloneReusedKeyPair());
  ByteString certDER(CreateEncodedCertificate(
                       v3, sha256WithRSAEncryption,
                       serialNumber, issuerDER,
                       oneDayBeforeNow - Time::ONE_DAY_IN_SECONDS,
                       oneDayBeforeNow,
                       subjectDER, *reusedKey, nullptr, *reusedKey,
                       sha256WithRSAEncryption));
  EXPECT_FALSE(ENCODING_FAILED(certDER));

  Input cert;
  ASSERT_EQ(Success, cert.Init(certDER.data(), certDER.length()));
  ASSERT_EQ(Result::ERROR_EXPIRED_CERTIFICATE,
            BuildCertChain(expiredCertTrustDomain, cert, Now(),
                           EndEntityOrCA::MustBeEndEntity,
                           KeyUsage::noParticularKeyUsageRequired,
                           KeyPurposeId::id_kp_serverAuth,
                           CertPolicyId::anyPolicy,
                           nullptr));
}

class DSSTrustDomain : public TrustDomain
{
public:
  virtual Result GetCertTrust(EndEntityOrCA, const CertPolicyId&,
                              Input, /*out*/ TrustLevel& trustLevel)
  {
    trustLevel = TrustLevel::TrustAnchor;
    return Success;
  }

  virtual Result FindIssuer(Input, IssuerChecker&, Time)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result CheckRevocation(EndEntityOrCA, const CertID&, Time,
                                 /*optional*/ const Input*,
                                 /*optional*/ const Input*)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result IsChainValid(const DERArray&, Time)
  {
    return Success;
  }

  virtual Result VerifySignedData(const SignedDataWithSignature& signedData,
                                  Input subjectPublicKeyInfo)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result DigestBuf(Input, /*out*/uint8_t*, size_t)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result CheckPublicKey(Input subjectPublicKeyInfo)
  {
    return TestCheckPublicKey(subjectPublicKeyInfo);
  }
};

class pkixbuild_DSS : public ::testing::Test { };

TEST_F(pkixbuild_DSS, DSSEndEntityKeyNotAccepted)
{
  DSSTrustDomain trustDomain;

  ByteString serialNumber(CreateEncodedSerialNumber(1));
  ASSERT_FALSE(ENCODING_FAILED(serialNumber));

  ByteString subjectDER(CNToDERName("DSS"));
  ASSERT_FALSE(ENCODING_FAILED(subjectDER));
  ScopedTestKeyPair subjectKey(GenerateDSSKeyPair());
  ASSERT_TRUE(subjectKey);

  ByteString issuerDER(CNToDERName("RSA"));
  ASSERT_FALSE(ENCODING_FAILED(issuerDER));
  ScopedTestKeyPair issuerKey(CloneReusedKeyPair());
  ASSERT_TRUE(issuerKey);

  ByteString cert(CreateEncodedCertificate(v3, sha256WithRSAEncryption,
                                           serialNumber, issuerDER,
                                           oneDayBeforeNow, oneDayAfterNow,
                                           subjectDER, *subjectKey, nullptr,
                                           *issuerKey, sha256WithRSAEncryption));
  ASSERT_FALSE(ENCODING_FAILED(cert));
  Input certDER;
  ASSERT_EQ(Success, certDER.Init(cert.data(), cert.length()));

  ASSERT_EQ(Result::ERROR_UNSUPPORTED_KEYALG,
            BuildCertChain(trustDomain, certDER, Now(),
                           EndEntityOrCA::MustBeEndEntity,
                           KeyUsage::noParticularKeyUsageRequired,
                           KeyPurposeId::id_kp_serverAuth,
                           CertPolicyId::anyPolicy,
                           nullptr/*stapledOCSPResponse*/));
}

class IssuerNameCheckTrustDomain : public TrustDomain
{
public:
  IssuerNameCheckTrustDomain(const ByteString& issuer, bool expectedKeepGoing)
    : issuer(issuer)
    , expectedKeepGoing(expectedKeepGoing)
  {
  }

  virtual Result GetCertTrust(EndEntityOrCA endEntityOrCA,
                              const CertPolicyId&, Input,
                              /*out*/ TrustLevel& trustLevel)
  {
    trustLevel = endEntityOrCA == EndEntityOrCA::MustBeCA
               ? TrustLevel::TrustAnchor
               : TrustLevel::InheritsTrust;
    return Success;
  }

  virtual Result FindIssuer(Input subjectCert, IssuerChecker& checker, Time)
  {
    Input issuerInput;
    EXPECT_EQ(Success, issuerInput.Init(issuer.data(), issuer.length()));
    bool keepGoing;
    EXPECT_EQ(Success,
              checker.Check(issuerInput, nullptr /*additionalNameConstraints*/,
                            keepGoing));
    EXPECT_EQ(expectedKeepGoing, keepGoing);
    return Success;
  }

  virtual Result CheckRevocation(EndEntityOrCA, const CertID&, Time,
                                 /*optional*/ const Input*,
                                 /*optional*/ const Input*)
  {
    return Success;
  }

  virtual Result IsChainValid(const DERArray&, Time)
  {
    return Success;
  }

  virtual Result VerifySignedData(const SignedDataWithSignature& signedData,
                                  Input subjectPublicKeyInfo)
  {
    return TestVerifySignedData(signedData, subjectPublicKeyInfo);
  }

  virtual Result DigestBuf(Input, /*out*/uint8_t*, size_t)
  {
    ADD_FAILURE();
    return Result::FATAL_ERROR_LIBRARY_FAILURE;
  }

  virtual Result CheckPublicKey(Input subjectPublicKeyInfo)
  {
    return TestCheckPublicKey(subjectPublicKeyInfo);
  }

private:
  const ByteString issuer;
  const bool expectedKeepGoing;
};

struct IssuerNameCheckParams
{
  const char* subjectIssuerCN; // null means "empty name"
  const char* issuerSubjectCN; // null means "empty name"
  bool matches;
};

static const IssuerNameCheckParams ISSUER_NAME_CHECK_PARAMS[] =
{
  { "foo", "foo", true },
  { "foo", "bar", false },
  { "f", "foo", false }, // prefix
  { "foo", "f", false }, // prefix
  { "foo", "Foo", false }, // case sensitive
  { "", "", true },
  { nullptr, nullptr, true }, // XXX(bug 1115718)
};

class pkixbuild_IssuerNameCheck
  : public ::testing::Test
  , public ::testing::WithParamInterface<IssuerNameCheckParams>
{
};

TEST_P(pkixbuild_IssuerNameCheck, MatchingName)
{
  const IssuerNameCheckParams& params(GetParam());

  ByteString issuerCertDER(CreateCert(params.issuerSubjectCN,
                                      params.issuerSubjectCN,
                                      EndEntityOrCA::MustBeCA, nullptr));
  ASSERT_FALSE(ENCODING_FAILED(issuerCertDER));

  ByteString subjectCertDER(CreateCert(params.subjectIssuerCN, "end-entity",
                                       EndEntityOrCA::MustBeEndEntity,
                                       nullptr));
  ASSERT_FALSE(ENCODING_FAILED(subjectCertDER));

  Input subjectCertDERInput;
  ASSERT_EQ(Success, subjectCertDERInput.Init(subjectCertDER.data(),
                                              subjectCertDER.length()));

  IssuerNameCheckTrustDomain trustDomain(issuerCertDER, !params.matches);
  ASSERT_EQ(params.matches ? Success : Result::ERROR_UNKNOWN_ISSUER,
            BuildCertChain(trustDomain, subjectCertDERInput, Now(),
                           EndEntityOrCA::MustBeEndEntity,
                           KeyUsage::noParticularKeyUsageRequired,
                           KeyPurposeId::id_kp_serverAuth,
                           CertPolicyId::anyPolicy,
                           nullptr/*stapledOCSPResponse*/));
}

INSTANTIATE_TEST_CASE_P(pkixbuild_IssuerNameCheck, pkixbuild_IssuerNameCheck,
                        testing::ValuesIn(ISSUER_NAME_CHECK_PARAMS));
