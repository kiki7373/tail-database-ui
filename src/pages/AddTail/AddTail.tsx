import axios from 'axios';
import { useEffect, useState } from 'react';
import { Button, Card, Col, Container, Row } from 'react-bootstrap';
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import FeatherIcon from 'feather-icons-react';
import { convertbits, decode } from 'chia/bech32';
import config from 'config';

// components
import { FormInput } from 'components/form';
import { useWalletConnectClient } from '../../walletconnect/contexts/ClientContext';
import { useJsonRpc } from '../../walletconnect/contexts/JsonRpcContext';
import { DEFAULT_MAIN_CHAINS, DEFAULT_TEST_CHAINS, DEFAULT_CHIA_METHODS } from '../../walletconnect/constants';
import { AccountAction } from '../../walletconnect/helpers';
import { useChainData } from '../../walletconnect/contexts/ChainDataContext';
import Blockchain from '../../walletconnect/components/Blockchain';

const CATEGORIES = ['gaming', 'event', 'education', 'meme', 'stablecoin', 'wrapped', 'platform'];

const AddTail = () => {
    // Use `JsonRpcContext` to provide us with relevant RPC methods and states.
    const { ping, chiaRpc, isRpcRequestPending, rpcResult, isTestnet, setIsTestnet } = useJsonRpc();
    const { chainData } = useChainData();
    // Initialize the WalletConnect client.
    const {
        client,
        pairings,
        session,
        connect,
        disconnect,
        chains,
        relayerRegion,
        accounts,
        isInitializing,
        setChains,
        setRelayerRegion,
    } = useWalletConnectClient();
    const chainOptions = isTestnet ? DEFAULT_TEST_CHAINS : DEFAULT_MAIN_CHAINS;
    const [modal, setModal] = useState('');
    const [inserted, setInserted] = useState(false);
    const [failedMessage, setFailedMessage] = useState('');
    const [signatureAddress, setSignatureAddress] = useState('');
    const [signatureMessage, setSignatureMessage] = useState('');
    const [hash, setHash] = useState('');
    const [coinId, setCoinId] = useState('');
    const closeModal = () => setModal('');
    const openPairingModal = () => setModal('pairing');
    const openPingModal = () => setModal('ping');
    const openRequestModal = () => setModal('request');

    const onHashChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value.length == 64) {
            setHash(event.target.value);
        } else {
            setHash('');
            setSignatureAddress('');
            setSignatureMessage('');
        }
    };
    const onCoinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value.length == 64) {
            setCoinId(event.target.value);
        } else {
            setCoinId('');
            setSignatureAddress('');
            setSignatureMessage('');
            setFailedMessage('');
        }
    };

    useEffect(() => {
        (async () => {
            if (hash.length == 64 && coinId.length == 64) {
                try {
                    const response = await axios.post(`${config.AUTH_URL}/${hash}`, { coinId });

                    const { address, message } = response.data;

                    if (address && message) {
                        setSignatureAddress(address);
                        setSignatureMessage(message);
                        setFailedMessage('');
                    } else {
                        setSignatureAddress('');
                        setSignatureMessage('');
                        setFailedMessage('');
                    }
                } catch (err: any) {
                    console.error(err);
                    setFailedMessage(err);
                    setSignatureAddress('');
                    setSignatureMessage('');
                }
            }
        })();
    }, [hash, coinId]);

    // form validation schema
    const schemaResolver = yupResolver(
        yup.object().shape({
            hash: yup.string().length(64).required('Please enter hash'),
            name: yup.string().min(1).max(100).required('Please enter name'),
            code: yup.string().min(1).max(5).required('Please enter code'),
            category: yup.string().oneOf(CATEGORIES).required('Please select category'),
            coin: yup.string().length(64).required('Please enter Coin ID'),
            logo: yup.string().length(62).required('Please enter NFT ID'),
            website_url: yup.string().optional().url(),
            twitter_url: yup.string().optional().url(),
            discord_url: yup.string().optional().url(),
        })
    );

    const methods = useForm({ resolver: schemaResolver });
    const {
        handleSubmit,
        register,
        control,
        formState: { errors },
    } = methods;

    const onSubmit: SubmitHandler<FieldValues> = async ({
        hash,
        name,
        code,
        logo,
        coin,
        category,
        description,
        website_url,
        twitter_url,
        discord_url,
        signature,
    }) => {
        const decode_result = decode(logo, 'bech32m');

        if (!decode_result) {
            setInserted(false);
            setFailedMessage('Invalid NFT ID');

            return;
        }

        const launcher_id_raw = convertbits(decode_result.data, 5, 8, false);

        if (!launcher_id_raw) {
            setInserted(false);
            setFailedMessage('Invalid NFT ID');

            return;
        }

        const launcherId = launcher_id_raw.map((n) => n.toString(16).padStart(2, '0')).join('');

        try {
            const response = await axios.post(
                config.ADD_TAIL_URL,
                {
                    hash,
                    name,
                    code,
                    category,
                    description,
                    launcherId,
                    eveCoinId: coin,
                    ...(website_url ? { website_url } : {}),
                    ...(twitter_url ? { twitter_url } : {}),
                    ...(discord_url ? { discord_url } : {}),
                },
                { headers: { 'x-chia-signature': signature } }
            );

            const { tx_id, error } = response.data;

            if (tx_id) {
                setInserted(true);
                setFailedMessage('');
            } else {
                setInserted(false);
                if (error) {
                    setFailedMessage(error);
                } else {
                    setFailedMessage(
                        'Failed to submit TAIL record to mempool. You can only submit the same TAIL hash once. If you recently submitted a record you must wait for it to clear before submitting another.'
                    );
                }
            }
        } catch (err: any) {
            console.error(err);
            setFailedMessage(err);
        }
    };

    const getChiaActions = (): AccountAction[] => {
        const onSendTransaction = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testSendTransaction(chainId, address);
        };

        const onNewAddress = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testNewAddress(chainId, address);
        };

        const onLogIn = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testLogIn(chainId, address);
        };

        const onSignMessageByAddress = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testSignMessageByAddress(chainId, address);
        };

        const onSignMessageById = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testSignMessageById(chainId, address);
        };

        const onGetWalletSyncStatus = async (chainId: string, address: string) => {
            openRequestModal();
            await chiaRpc.testGetWalletSyncStatus(chainId, address);
        };

        return [
            {
                method: DEFAULT_CHIA_METHODS.CHIA_SEND_TRANSACTION,
                callback: onSendTransaction,
            },
            {
                method: DEFAULT_CHIA_METHODS.CHIA_NEW_ADDRESS,
                callback: onNewAddress,
            },
            {
                method: DEFAULT_CHIA_METHODS.CHIA_LOG_IN,
                callback: onLogIn,
            },
            {
                method: DEFAULT_CHIA_METHODS.CHIA_SIGN_MESSAGE_BY_ADDRESS,
                callback: onSignMessageByAddress,
            },
            {
                method: DEFAULT_CHIA_METHODS.CHIA_SIGN_MESSAGE_BY_ID,
                callback: onSignMessageById,
            },
            {
                method: DEFAULT_CHIA_METHODS.CHIA_GET_WALLET_SYNC_STATUS,
                callback: onGetWalletSyncStatus,
            },
        ];
    };

    const getBlockchainActions = (chainId: string) => {
        const [namespace] = chainId.split(':');
        switch (namespace) {
            case 'chia':
                return getChiaActions();
            default:
                break;
        }
    };

    return (
        <section className="section pb-lg-7 py-4 position-relative">
            <Container>
                {inserted && <>TAIL record submitted to mempool</>}
                {!inserted && (
                    <Row className="align-items-center">
                        <Col log={12}>
                            {accounts.map((account) => {
                                const [namespace, reference, address] = account.split(':');
                                const chainId = `${namespace}:${reference}`;
                                return (
                                    <Blockchain
                                        key={account}
                                        active={true}
                                        chainData={chainData}
                                        address={address}
                                        chainId={chainId}
                                        actions={getBlockchainActions(chainId)}
                                    />
                                );
                            })}
                        </Col>
                        <Col lg={12} style={{ color: 'red' }}>
                            When you add or update details in Tail Database the update is applied to DataLayer however
                            this website is only updated once every 10 minutes. If you use the Tail Database standalone
                            application you can see updates quicker as that updates more frequently.
                        </Col>
                        <Col lg={12}>
                            <Card className="shadow-none">
                                {failedMessage && (
                                    <div className="alert alert-danger" role="alert">
                                        {failedMessage}
                                    </div>
                                )}
                                <Card.Body className="p-xl-5 p-0">
                                    <form onSubmit={handleSubmit(onSubmit)}>
                                        <Row>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="hash"
                                                    name="hash"
                                                    label="Asset ID"
                                                    placeholder="Asset ID"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                    onChange={onHashChange}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="name"
                                                    name="name"
                                                    label="Name"
                                                    placeholder="Name"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="code"
                                                    name="code"
                                                    label="Code"
                                                    placeholder="Code"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="logo"
                                                    name="logo"
                                                    label="Logo NFT ID"
                                                    placeholder="Logo NFT ID"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="coin"
                                                    name="coin"
                                                    label="CAT Coin ID"
                                                    placeholder="CAT Coin ID"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                    onChange={onCoinChange}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="website_url"
                                                    name="website_url"
                                                    label="Website URL"
                                                    placeholder="Website URL"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="twitter_url"
                                                    name="twitter_url"
                                                    label="Twitter URL"
                                                    placeholder="Twitter URL"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="discord_url"
                                                    name="discord_url"
                                                    label="Discord URL"
                                                    placeholder="Discord URL"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="select"
                                                    name="category"
                                                    label="Category"
                                                    placeholder="Category"
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                >
                                                    <option value="option_select0">Category</option>
                                                    {CATEGORIES.map((category) => (
                                                        <option value={category} key={category}>
                                                            {category}
                                                        </option>
                                                    ))}
                                                </FormInput>
                                            </Col>
                                            <Col lg={12}>
                                                <FormInput
                                                    type="textarea"
                                                    name="description"
                                                    label="Description"
                                                    placeholder="Type Your description..."
                                                    rows={5}
                                                    containerClass={'mb-3'}
                                                    register={register}
                                                    errors={errors}
                                                    control={control}
                                                />
                                            </Col>
                                            <Col lg={12}>
                                                <h4>Authorization</h4>
                                                <p>
                                                    To make this change you need to sign a message using the wallet
                                                    which minted the CAT. The CLI command you need to execute will
                                                    appear once you have populated the asset id and coin id correctly.
                                                </p>
                                                {signatureAddress && signatureMessage && (
                                                    <SyntaxHighlighter language="lisp" style={docco} wrapLongLines>
                                                        {`chia wallet sign_message -a ${signatureAddress} -m ${signatureMessage}`}
                                                    </SyntaxHighlighter>
                                                )}
                                            </Col>
                                            {signatureAddress && signatureMessage && (
                                                <Col lg={12}>
                                                    <FormInput
                                                        type="signature"
                                                        name="signature"
                                                        label="Signature"
                                                        placeholder="Signature"
                                                        containerClass={'mb-3'}
                                                        register={register}
                                                        errors={errors}
                                                        control={control}
                                                    />
                                                </Col>
                                            )}
                                            <Col lg="auto" className="mb-0">
                                                <Button type="submit" disabled={!signatureAddress || !signatureMessage}>
                                                    Add
                                                    <span className="icon icon-xs text-white ms-1">
                                                        <FeatherIcon icon="plus-circle" />
                                                    </span>
                                                </Button>
                                            </Col>
                                        </Row>
                                    </form>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                )}
            </Container>
        </section>
    );
};

export default AddTail;
